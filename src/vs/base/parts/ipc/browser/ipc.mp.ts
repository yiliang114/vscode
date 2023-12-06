/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';

/**
 * TODO: Web 端会作为 IPC 连接的客户端？？？？ Web 端不是应该作为 RPC 的客户端么？？？
 * electron 端的 IPC 实现与 Web 端差异是比较大的。
 *
 * An implementation of a `IPCClient` on top of DOM `MessagePort`.
 */
export class Client extends MessagePortClient implements IDisposable {

	/**
	 * @param clientId a way to uniquely identify this client among
	 * other clients. this is important for routing because every
	 * client can also be a server
	 */
	constructor(port: MessagePort, clientId: string) {
		super(port, clientId);
	}
}
