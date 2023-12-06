/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';

export interface Sender {
	send(channel: string, msg: unknown): void;
}

/**
 * 协议，即约定，约定内容其实就是：在哪个channel: string 发消息。
 * 协议也就是按照约定的规范创建接口和返回，就可以进行通信。至于通信是通过什么频道（或者方式），我不管。
 *
 * 至于具体协议内容，可能包括连接、断开、事件等等
 *
 * The Electron `Protocol` leverages Electron style IPC communication (`ipcRenderer`, `ipcMain`)
 * for the implementation of the `IMessagePassingProtocol`. That style of API requires a channel
 * name for sending data.
 */
export class Protocol implements IMessagePassingProtocol {

	constructor(private sender: Sender, readonly onMessage: Event<VSBuffer>) { }

	// 发送消息
	send(message: VSBuffer): void {
		try {
			// 'vscode:message' 本质上是一个频道
			this.sender.send('vscode:message', message.buffer);
		} catch (e) {
			// systems are going down
		}
	}

	// 断开连接
	disconnect(): void {
		this.sender.send('vscode:disconnect', null);
	}
}
