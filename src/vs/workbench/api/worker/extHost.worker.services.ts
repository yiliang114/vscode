/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { ExtHostLogService } from 'vs/workbench/api/common/extHostLogService';
import { ExtensionStoragePaths, IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { ExtHostExtensionService } from 'vs/workbench/api/worker/extHostExtensionService';

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
