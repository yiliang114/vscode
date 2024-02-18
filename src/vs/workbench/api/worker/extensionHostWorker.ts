/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { isMessageOfType, MessageType, createMessageOfType, IExtensionHostInitData } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ExtensionHostMain } from 'vs/workbench/api/common/extensionHostMain';
import { IHostUtils } from 'vs/workbench/api/common/extHostExtensionService';
import { NestedWorker } from 'vs/workbench/services/extensions/worker/polyfillNestedWorker';
import * as path from 'vs/base/common/path';
import * as performance from 'vs/base/common/performance';

// 加载扩展进程公共服务
import 'vs/workbench/api/common/extHost.common.services';
// 加载扩展进程 Worker 中的服务
import 'vs/workbench/api/worker/extHost.worker.services';
import { FileAccess } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';

//#region --- Define, capture, and override some globals

declare function postMessage(data: any, transferables?: Transferable[]): void;
declare const name: string; // https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/name
declare type _Fetch = typeof fetch;

declare namespace self {
	let close: any;
	let postMessage: any;
	let addEventListener: any;
	let removeEventListener: any;
	let dispatchEvent: any;
	let indexedDB: { open: any;[k: string]: any };
	let caches: { open: any;[k: string]: any };
	let importScripts: any;
	let fetch: _Fetch;
	let XMLHttpRequest: any;
}

// Worker 关闭事件
const nativeClose = self.close.bind(self);
self.close = () => console.trace(`'close' has been blocked`);

// worker 与 html 之间是通过 postMessage 通信
const nativePostMessage = postMessage.bind(self);
self.postMessage = () => console.trace(`'postMessage' has been blocked`);

function shouldTransformUri(uri: string): boolean {
	// In principle, we could convert any URI, but we have concerns
	// that parsing https URIs might end up decoding escape characters
	// and result in an unintended transformation
	// 原则上，我们可以转换任何URI，但我们担心
	// 解析https uri可能最终会解码转义字符
	// 并导致意外的转换
	return /^(file|vscode-remote):/i.test(uri);
}

// 原生 fetch
const nativeFetch = fetch.bind(self);
function patchFetching(asBrowserUri: (uri: URI) => Promise<URI>) {
	self.fetch = async function (input, init) {
		if (input instanceof Request) {
			// Request object - massage not supported
			return nativeFetch(input, init);
		}
		// 转换文件的协议，通过 http 请求
		if (shouldTransformUri(String(input))) {
			input = (await asBrowserUri(URI.parse(String(input)))).toString(true);
		}
		return nativeFetch(input, init);
	};

	self.XMLHttpRequest = class extends XMLHttpRequest {
		override open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
			(async () => {
				if (shouldTransformUri(url.toString())) {
					url = (await asBrowserUri(URI.parse(url.toString()))).toString(true);
				}
				super.open(method, url, async ?? true, username, password);
			})();
		}
	};
}

self.importScripts = () => { throw new Error(`'importScripts' has been blocked`); };

// const nativeAddEventListener = addEventListener.bind(self);
self.addEventListener = () => console.trace(`'addEventListener' has been blocked`);

(<any>self)['AMDLoader'] = undefined;
(<any>self)['NLSLoaderPlugin'] = undefined;
(<any>self)['define'] = undefined;
(<any>self)['require'] = undefined;
(<any>self)['webkitRequestFileSystem'] = undefined;
(<any>self)['webkitRequestFileSystemSync'] = undefined;
(<any>self)['webkitResolveLocalFileSystemSyncURL'] = undefined;
(<any>self)['webkitResolveLocalFileSystemURL'] = undefined;

if ((<any>self).Worker) {

	// make sure new Worker(...) always uses blob: (to maintain current origin)
	const _Worker = (<any>self).Worker;
	Worker = <any>function (stringUrl: string | URL, options?: WorkerOptions) {
		if (/^file:/i.test(stringUrl.toString())) {
			stringUrl = FileAccess.uriToBrowserUri(URI.parse(stringUrl.toString())).toString(true);
		} else if (/^vscode-remote:/i.test(stringUrl.toString())) {
			// Supporting transformation of vscode-remote URIs requires an async call to the main thread,
			// but we cannot do this call from within the embedded Worker, and the only way out would be
			// to use templating instead of a function in the web api (`resourceUriProvider`)
			throw new Error(`Creating workers from remote extensions is currently not supported.`);
		}

		// IMPORTANT: bootstrapFn is stringified and injected as worker blob-url. Because of that it CANNOT
		// have dependencies on other functions or variables. Only constant values are supported. Due to
		// that logic of FileAccess.asBrowserUri had to be copied, see `asWorkerBrowserUrl` (below).
		const bootstrapFnSource = (function bootstrapFn(workerUrl: string) {
			function asWorkerBrowserUrl(url: string | URL | TrustedScriptURL): any {
				if (typeof url === 'string' || url instanceof URL) {
					return String(url).replace(/^file:\/\//i, 'vscode-file://vscode-app');
				}
				return url;
			}

			const nativeFetch = fetch.bind(self);
			self.fetch = function (input, init) {
				if (input instanceof Request) {
					// Request object - massage not supported
					return nativeFetch(input, init);
				}
				return nativeFetch(asWorkerBrowserUrl(input), init);
			};
			self.XMLHttpRequest = class extends XMLHttpRequest {
				override open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
					return super.open(method, asWorkerBrowserUrl(url), async ?? true, username, password);
				}
			};
			const nativeImportScripts = importScripts.bind(self);
			self.importScripts = (...urls: string[]) => {
				nativeImportScripts(...urls.map(asWorkerBrowserUrl));
			};

			nativeImportScripts(workerUrl);
		}).toString();

		const js = `(${bootstrapFnSource}('${stringUrl}'))`;
		options = options || {};
		options.name = `${name} -> ${options.name || path.basename(stringUrl.toString())}`;
		const blob = new Blob([js], { type: 'application/javascript' });
		const blobUrl = URL.createObjectURL(blob);
		// TODO: 继续额外创建一个 Worker ？
		return new _Worker(blobUrl, options);
	};

} else {
	// TODO: 为什么需要再创建一个嵌套的 Worker 呢？
	(<any>self).Worker = class extends NestedWorker {
		constructor(stringOrUrl: string | URL, options?: WorkerOptions) {
			super(nativePostMessage, stringOrUrl, { name: path.basename(stringOrUrl.toString()), ...options });
		}
	};
}

//#endregion ---

const hostUtil = new class implements IHostUtils {
	declare readonly _serviceBrand: undefined;
	public readonly pid = undefined;
	exit(_code?: number | undefined): void {
		nativeClose();
	}
};


class ExtensionWorker {

	// protocol
	readonly protocol: IMessagePassingProtocol;

	constructor() {

		// 利用 MessageChannel 的双边通道来通信。
		const channel = new MessageChannel();
		const emitter = new Emitter<VSBuffer>();
		let terminating = false;

		// 通过 postMessage 给 iframe 层发送了消息，
		// send over port2, keep port1. 将 channel 的另一个通道，传送给 iframe 层。
		nativePostMessage(channel.port2, [channel.port2]);

		// 监听 port2 （iframe 层） 发送过来的消息
		channel.port1.onmessage = event => {
			const { data } = event;
			if (!(data instanceof ArrayBuffer)) {
				console.warn('UNKNOWN data received', data);
				return;
			}

			const msg = VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength));
			if (isMessageOfType(msg, MessageType.Terminate)) {
				// handle terminate-message right here
				terminating = true;
				onTerminate('received terminate message from renderer');
				return;
			}

			// emit non-terminate messages to the outside
			emitter.fire(msg);
		};

		// 扩展 Worker 通过 channel 发送消息
		this.protocol = {
			onMessage: emitter.event,
			send: vsbuf => {
				if (!terminating) {
					const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
					// 将 Worker 中的数据，通过 channel 通道发送出去。
					channel.port1.postMessage(data, [data]);
				}
			}
		};
	}
}

interface IRendererConnection {
	protocol: IMessagePassingProtocol;
	initData: IExtensionHostInitData;
}

// 连接到渲染器 (可能是浏览器或其他图形界面) 的通信协议
function connectToRenderer(protocol: IMessagePassingProtocol): Promise<IRendererConnection> {
	return new Promise<IRendererConnection>(resolve => {
		// “服务端” 第一次发送消息，被接收消息之后
		const once = protocol.onMessage(raw => {
			once.dispose();
			const initData = <IExtensionHostInitData>JSON.parse(raw.toString());
			// 告诉 “服务端” 初始化结束
			protocol.send(createMessageOfType(MessageType.Initialized));
			// 传出协议和初始化数据
			resolve({ protocol, initData });
		});
		// （通知 “服务端”）准备完毕，接着会收到 “服务端” 的消息，将初始化的数据保存下来。
		protocol.send(createMessageOfType(MessageType.Ready));
	});
}

let onTerminate = (reason: string) => nativeClose();

interface IInitMessage {
	readonly type: 'vscode.init';
	readonly data: ReadonlyMap<string, MessagePort>;
}

// WebWorkerExtensionHost 宿主在初始化 iframe 时会发送该消息。
function isInitMessage(a: any): a is IInitMessage {
	return !!a && typeof a === 'object' && a.type === 'vscode.init' && a.data instanceof Map;
}

// TODO: 暂时未知是哪里触发的。
// 在 workerMain.ts 中触发，该模块被 AMD Loader 加载之后，拿到句柄，调用 create() 执行后续的逻辑
// 由浏览器端，通过 Web Worker 实现的扩展宿主进程
export function create(): { onmessage: (message: any) => void } {
	performance.mark(`code/extHost/willConnectToRenderer`);
	// 初始化 worker，最重要的事：
	// 1. 建立好 worker 与 iframe 之间的通信通道
	// 2. ....
	const res = new ExtensionWorker();

	return {
		onmessage(message: any) {
			if (!isInitMessage(message)) {
				return; // silently ignore foreign messages
			}

			connectToRenderer(res.protocol).then(data => {
				performance.mark(`code/extHost/didWaitForInitData`);

				// TODO: 实际上，我们所说的扩展进程、扩展进程一直说的是“宿主”，是包含扩展进程运行环境的。
				// 扩展宿主进程初始化
				const extHostMain = new ExtensionHostMain(
					data.protocol, // TODO: 由 MessageChannel 双边通信协议封装的一个对象，包含 send 和 onMessage 函数。
					data.initData,
					hostUtil,
					null,
					message.data
				);

				// 注册 worker 环境下 fetch 和 ajax 事件的拦截器，主要是给 uri 携带上浏览器前缀？？？
				patchFetching(uri => extHostMain.asBrowserUri(uri));

				// 终止事件
				onTerminate = (reason: string) => extHostMain.terminate(reason);
			});
		}
	};
}
