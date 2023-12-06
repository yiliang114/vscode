/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol, IPCClient } from 'vs/base/parts/ipc/common/ipc';

/**
 * Declare minimal `MessageEvent` and `MessagePort` interfaces here
 * so that this utility can be used both from `browser` and
 * `electron-main` namespace where message ports are available.
 */

export interface MessageEvent {

	/**
	 * For our use we only consider `Uint8Array` a valid data transfer
	 * via message ports because our protocol implementation is buffer based.
	 */
	data: Uint8Array;
}

export interface MessagePort {

	addEventListener(type: 'message', listener: (this: MessagePort, e: MessageEvent) => unknown): void;
	removeEventListener(type: 'message', listener: (this: MessagePort, e: MessageEvent) => unknown): void;

	postMessage(message: Uint8Array): void;

	start(): void;
	close(): void;
}

/**
 * 至于具体协议内容，可能包括连接、断开、事件等等
 *
 * The MessagePort `Protocol` leverages MessagePort style IPC communication
 * for the implementation of the `IMessagePassingProtocol`. That style of API
 * is a simple `onmessage` / `postMessage` pattern.
 */
export class Protocol implements IMessagePassingProtocol {

	// 将通道的数据，转化为 VSBuffer 形式的
	readonly onMessage = Event.fromDOMEventEmitter<VSBuffer>(this.port, 'message', (e: MessageEvent) => VSBuffer.wrap(e.data));

	constructor(private port: MessagePort) {

		// 初始化的时候是暂停的。onmessage 已经隐式调用了 start() 方法。但是这里不是直接调用 onmessage 而是监听 message 事件，之后要手动调用 start() 方法消息才能流动。
		// we must call start() to ensure messages are flowing
		port.start();
	}

	send(message: VSBuffer): void {
		this.port.postMessage(message.buffer);
	}

	disconnect(): void {
		this.port.close();
	}
}

/**
 * An implementation of a `IPCClient` on top of MessagePort style IPC communication.
 */
export class Client extends IPCClient implements IDisposable {

	private protocol: Protocol;

	constructor(port: MessagePort, clientId: string) {
		// 其实是对 MessageChannel 实例的 port 的封装。
		// 传入 MessagePort（对于 Web 端而言是 MessageChannel 的一个 port) 来初始化一个 protocol.
		const protocol = new Protocol(port);
		super(protocol, clientId);

		this.protocol = protocol;
	}

	// 断开链接
	override dispose(): void {
		// 断开链接
		this.protocol.disconnect();

		super.dispose();
	}
}
