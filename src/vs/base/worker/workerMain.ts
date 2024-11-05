/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {

	function loadCode(moduleId: string): Promise<SimpleWorkerModule> {
		const moduleUrl = new URL(`${moduleId}.js`, globalThis._VSCODE_FILE_ROOT);
		return import(moduleUrl.href);
	}

	interface MessageHandler {
		onmessage(msg: any, ports: readonly MessagePort[]): void;
	}

	// shape of vs/base/common/worker/simpleWorker.ts
	interface SimpleWorkerModule {
		create(postMessage: (msg: any, transfer?: Transferable[]) => void): MessageHandler;
	}

	// TODO: 通过设置 ws ？初始化 Worker 逻辑？
	function setupWorkerServer(ws: SimpleWorkerModule) {
		// TODO: 延迟执行 ??
		setTimeout(function () {
			// TODO: extensionHostWorker.ts 文件导出的 create 函数 ？？ 但是那个 create 函数并不需要传参。
			// 似乎也很像是 simpleWorker.ts 导出的内容
			const messageHandler = ws.create((msg: any, transfer?: Transferable[]) => {
				(<any>globalThis).postMessage(msg, transfer);
			});

			self.onmessage = (e: MessageEvent) => messageHandler.onmessage(e.data, e.ports);
			while (beforeReadyMessages.length > 0) {
				self.onmessage(beforeReadyMessages.shift()!);
			}
		}, 0);
	}

	let isFirstMessage = true;
	const beforeReadyMessages: MessageEvent[] = [];
	globalThis.onmessage = (message: MessageEvent) => {
		// TODO: 因为只有首个消息传送是用于加载静态资源的？？？
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		// iframe 主进程中，通过 postMessage 请求资源
		loadCode(message.data).then((ws) => {
			setupWorkerServer(ws);
		}, (err) => {
			console.error(err);
		});
	};
})();
