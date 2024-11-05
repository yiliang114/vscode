/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractExtHostConsoleForwarder } from '../common/extHostConsoleForwarder.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';

export class ExtHostConsoleForwarder extends AbstractExtHostConsoleForwarder {

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(extHostRpc, initData);
	}

	// 远程的 console 服务。
	// 扩展代码中的 console，本质上是运行在 worker 环境下， 无法直接打印在 console 中。
	protected override _nativeConsoleLogMessage(_method: unknown, original: (...args: any[]) => void, args: IArguments) {
		original.apply(console, args as any);
	}
}
