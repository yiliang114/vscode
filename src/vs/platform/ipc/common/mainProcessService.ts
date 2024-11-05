/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IPCServer, IServerChannel, StaticRouter } from '../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRemoteService } from './services.js';

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

// TODO: 这个主进程似乎是只有在 Node 和 Electron 中才会存在？
export interface IMainProcessService extends IRemoteService { }

/**
 * An implementation of `IMainProcessService` that leverages `IPCServer`.
 */
export class MainProcessService implements IMainProcessService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private server: IPCServer,
		private router: StaticRouter
	) { }

	// getChannel/registerChannel 是 vscode 自己创造的概念，而不是 MessageChannel 原生就有的。TODO: 为什么要有？
	getChannel(channelName: string): IChannel {
		return this.server.getChannel(channelName, this.router);
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.server.registerChannel(channelName, channel);
	}
}
