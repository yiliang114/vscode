/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewWorkerMessage, TerminateWorkerMessage } from 'vs/workbench/services/extensions/common/polyfillNestedWorker.protocol';

declare function postMessage(data: any, transferables?: Transferable[]): void;

declare type MessageEventHandler = ((ev: MessageEvent<any>) => any) | null;

const _bootstrapFnSource = (function _bootstrapFn(workerUrl: string) {

	const listener: EventListener = (event: Event): void => {
		// uninstall handler
		globalThis.removeEventListener('message', listener);

		// get data
		const port = <MessagePort>(<MessageEvent>event).data;

		// postMessage
		// onmessage
		Object.defineProperties(globalThis, {
			'postMessage': {
				value(data: any, transferOrOptions?: any) {
					port.postMessage(data, transferOrOptions);
				}
			},
			'onmessage': {
				get() {
					return port.onmessage;
				},
				set(value: MessageEventHandler) {
					port.onmessage = value;
				}
			}
			// todo onerror
		});

		port.addEventListener('message', msg => {
			globalThis.dispatchEvent(new MessageEvent('message', { data: msg.data, ports: msg.ports ? [...msg.ports] : undefined }));
		});

		port.start();

		// fake recursively nested worker
		globalThis.Worker = <any>class { constructor() { throw new TypeError('Nested workers from within nested worker are NOT supported.'); } };

		// load module
		importScripts(workerUrl);
	};

	globalThis.addEventListener('message', listener);
}).toString();


// TODO: 嵌套 Worker
// 它的主要目的是在 Web Worker 环境中创建一个嵌套的工作线程。
export class NestedWorker extends EventTarget implements Worker {

	onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
	onmessageerror: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
	onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;

	readonly terminate: () => void;
	readonly postMessage: (message: any, options?: any) => void;

	constructor(nativePostMessage: typeof postMessage, stringOrUrl: string | URL, options?: WorkerOptions) {
		super();

		// create bootstrap script. 创建初始化脚本
		const bootstrap = `((${_bootstrapFnSource})('${stringOrUrl}'))`; // 被加载之后，直接执行的代码。
		const blob = new Blob([bootstrap], { type: 'application/javascript' });
		const blobUrl = URL.createObjectURL(blob);

		// 在主工作线程与嵌套工作线程之间通信。
		const channel = new MessageChannel();
		const id = blobUrl; // works because blob url is unique, needs ID pool otherwise

		const msg: NewWorkerMessage = {
			type: '_newWorker',
			id,
			port: channel.port2,
			url: blobUrl,
			options,
		};
		// 将 port2 发送出去，告诉外部 （应该是 主 workerMain 进程）可以通过这个 port 来跟 _newWorker 进行通信。
		nativePostMessage(msg, [channel.port2]);

		// worker-impl: functions
		this.postMessage = channel.port1.postMessage.bind(channel.port1);
		this.terminate = () => {
			// 它将发送一个TerminateWorkerMessage消息到父工作线程以终止嵌套工作线程，并释放 Blob URL 和关闭通道端口。
			const msg: TerminateWorkerMessage = {
				type: '_terminateWorker',
				id
			};
			nativePostMessage(msg);
			URL.revokeObjectURL(blobUrl);

			channel.port1.close();
			channel.port2.close();
		};

		// worker-impl: events
		Object.defineProperties(this, {
			'onmessage': {
				get() {
					return channel.port1.onmessage;
				},
				// 注册 onmessage 事件
				set(value: MessageEventHandler) {
					channel.port1.onmessage = value;
				}
			},
			'onmessageerror': {
				get() {
					return channel.port1.onmessageerror;
				},
				set(value: MessageEventHandler) {
					channel.port1.onmessageerror = value;
				}
			},
			// todo onerror
		});

		channel.port1.addEventListener('messageerror', evt => {
			const msgEvent = new MessageEvent('messageerror', { data: evt.data });
			this.dispatchEvent(msgEvent);
		});

		channel.port1.addEventListener('message', evt => {
			const msgEvent = new MessageEvent('message', { data: evt.data });
			this.dispatchEvent(msgEvent);
		});

		// 开始建立通道，后续可接收 postMessage 事件
		channel.port1.start();
	}
}
