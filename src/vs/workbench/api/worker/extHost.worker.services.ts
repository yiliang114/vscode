/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostExtensionService } from '../common/extHostExtensionService.js';
import { ExtHostLogService } from '../common/extHostLogService.js';
import { ExtensionStoragePaths, IExtensionStoragePaths } from '../common/extHostStoragePaths.js';
import { ExtHostExtensionService } from './extHostExtensionService.js';

// #########################################################################
// ###                                                                   ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO extHost.common.services.ts !!! ###
// ###                                                                   ###
// #########################################################################

// 与 extHost.node.services.ts 相比，少了很多的服务注入。特别是后端服务

// 特殊的日志服务，与 electron 必然有差异
registerSingleton(ILogService, new SyncDescriptor(ExtHostLogService, [true], true));
// worker 端的扩展宿主服务，Service 应该不是环境？而是供其他 Service 调用的方法合集。
registerSingleton(IExtHostExtensionService, ExtHostExtensionService, InstantiationType.Eager); // Eager 需要的话，立即初始化
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths, InstantiationType.Eager);
