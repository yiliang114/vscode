/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { DiskFileSystemProviderClient } from '../../../../platform/files/common/diskFileSystemProviderClient.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteAgentEnvironment } from '../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IRemoteAgentConnection, IRemoteAgentService } from './remoteAgentService.js';

export const REMOTE_FILE_SYSTEM_CHANNEL_NAME = 'remoteFilesystem';

export class RemoteFileSystemProviderClient extends DiskFileSystemProviderClient {

	static register(remoteAgentService: IRemoteAgentService, fileService: IFileService, logService: ILogService): IDisposable {
		// 如果没有远程连接，就不会有 vscode-remote 这个文件系统。所以需要远程连接的话， 就必须有 remoteAgentService，而关键是 remoteAuthority 值。 TODO: 不清楚为什么 code-server 给了一个 'remote' 值，难道是二级路径？？
		const connection = remoteAgentService.getConnection();
		if (!connection) {
			return Disposable.None;
		}

		const disposables = new DisposableStore();

		const environmentPromise = (async () => {
			try {
				const environment = await remoteAgentService.getRawEnvironment();
				if (environment) {
					// Register remote fsp even before it is asked to activate
					// because, some features (configuration) wait for its
					// registration before making fs calls.
					// TODO: 所以看起来 vscode-remote 这个 scheme 的文件系统 provider，首先是 vscode 原生提供，并且需要复用现有的 remote connection 的一个文件系统。
					// 从 fsp 注册规则上来说， RemoteFileSystemProviderClient 是一个包含 readFile/writeFile... 之类的 class, 实现在 RemoteFileSystemProviderClient => DiskFileSystemProviderClient 里
					// readFile/writeFile... 之类的 API 实际是通过 channel 远程调用 call 在 node 完成相关的操作之后拿到的结果，会作为给 fsp 相关函数的返回
					fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new RemoteFileSystemProviderClient(environment, connection)));
					// 文件系统只是复用 remote connection.
					// 如果我知道了 ws 连接，
				} else {
					logService.error('Cannot register remote filesystem provider. Remote environment doesnot exist.');
				}
			} catch (error) {
				logService.error('Cannot register remote filesystem provider. Error while fetching remote environment.', getErrorMessage(error));
			}
		})();

		// 主应用的文件服务激活 vscode-remote 相关的 uri 之后
		// 需要立即将 vscode-remote 的 fsp 注册上。
		// TODO: 所有的文件系统实际上不是一上来就注册的？ 而是需要相关的文件打开后，再调用一下 register ？？
		disposables.add(fileService.onWillActivateFileSystemProvider(e => {
			if (e.scheme === Schemas.vscodeRemote) {
				e.join(environmentPromise);
			}
		}));

		return disposables;
	}

	private constructor(remoteAgentEnvironment: IRemoteAgentEnvironment, connection: IRemoteAgentConnection) {
		// TODO: 如果我知道有一个 code-sevrer 实例的 node 提供的 ws 地址（并且鉴权也能通过的情况下），是否就能在 extension side 访问到这个文件系统？
		// 获取到一个约定好的 channel，与 node 端后续进行数据通信。
		super(connection.getChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: remoteAgentEnvironment.os === OperatingSystem.Linux });
	}
}
