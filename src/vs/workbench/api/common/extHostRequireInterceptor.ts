/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as performance from '../../../base/common/performance.js';
import { URI } from '../../../base/common/uri.js';
import { MainThreadTelemetryShape, MainContext } from './extHost.protocol.js';
import { ExtHostConfigProvider, IExtHostConfiguration } from './extHostConfiguration.js';
import { nullExtensionDescription } from '../../services/extensions/common/extensions.js';
import * as vscode from 'vscode';
import { ExtensionIdentifierMap } from '../../../platform/extensions/common/extensions.js';
import { IExtensionApiFactory, IExtensionRegistries } from './extHost.api.impl.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ExtensionPaths, IExtHostExtensionService } from './extHostExtensionService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';


interface LoadFunction {
	(request: string): any;
}

interface IAlternativeModuleProvider {
	alternativeModuleName(name: string): string | undefined;
}

interface INodeModuleFactory extends Partial<IAlternativeModuleProvider> {
	readonly nodeModuleName: string | string[];
	load(request: string, parent: URI, original: LoadFunction): any;
}

// 在 Node 和 Worker 也有不同的实现。
// 用于拦截 Node.js 模块加载行为。该类在构造函数中接收多个依赖项并初始化一些成员变量。它提供了一个 install 方法来安装拦截器，并通过 _installInterceptor 抽象方法实现具体的拦截逻辑。
// 这个类的主要目的是允许扩展程序自定义模块加载行为（例如使用替代模块或添加额外的功能）。这可以通过向 RequireInterceptor 注册实现 INodeModuleFactory 或 IAlternativeModuleProvider 接口的对象来完成。
export abstract class RequireInterceptor {

	// 存储已注册模块工厂的映射表。
	protected readonly _factories: Map<string, INodeModuleFactory>;
	// 存储可为特定模块提供替代名称的回调数组。
	protected readonly _alternatives: ((moduleName: string) => string | undefined)[];

	constructor(
		private _apiFactory: IExtensionApiFactory, // API 工厂
		private _extensionRegistry: IExtensionRegistries, // 扩展注册表
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IExtHostConfiguration private readonly _extHostConfiguration: IExtHostConfiguration, // 配置服务
		@IExtHostExtensionService private readonly _extHostExtensionService: IExtHostExtensionService,
		@IExtHostInitDataService private readonly _initData: IExtHostInitDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._factories = new Map<string, INodeModuleFactory>();
		this._alternatives = [];
	}

	async install(): Promise<void> {

		// 使用 _installInterceptor 安装拦截器（具体实现由子类提供）
		this._installInterceptor();

		// 等待配置提供者可用后，获取扩展路径索引。
		performance.mark('code/extHost/willWaitForConfig');
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		performance.mark('code/extHost/didWaitForConfig');
		const extensionPaths = await this._extHostExtensionService.getExtensionPathIndex();

		// 注册多个模块工厂和/或替代模块提供者。
		this.register(new VSCodeNodeModuleFactory(this._apiFactory, extensionPaths, this._extensionRegistry, configProvider, this._logService));
		this.register(this._instaService.createInstance(NodeModuleAliasingModuleFactory));
		if (this._initData.remote.isRemote) {
			this.register(this._instaService.createInstance(OpenNodeModuleFactory, extensionPaths, this._initData.environment.appUriScheme));
		}
	}

	// 抽象方法，子类需要覆盖以实现拦截器的具体逻辑。
	protected abstract _installInterceptor(): void;

	// 将给定的模块工厂或替代模块提供者注册到 RequireInterceptor 中。根据提供的对象类型，将其添加到相应的集合中以便后续使用。
	public register(interceptor: INodeModuleFactory | IAlternativeModuleProvider): void {
		if ('nodeModuleName' in interceptor) {
			if (Array.isArray(interceptor.nodeModuleName)) {
				for (const moduleName of interceptor.nodeModuleName) {
					this._factories.set(moduleName, interceptor);
				}
			} else {
				this._factories.set(interceptor.nodeModuleName, interceptor);
			}
		}

		if (typeof interceptor.alternativeModuleName === 'function') {
			this._alternatives.push((moduleName) => {
				return interceptor.alternativeModuleName!(moduleName);
			});
		}
	}
}

//#region --- module renames

class NodeModuleAliasingModuleFactory implements IAlternativeModuleProvider {
	/**
	 * Map of aliased internal node_modules, used to allow for modules to be
	 * renamed without breaking extensions. In the form "original -> new name".
	 */
	private static readonly aliased: ReadonlyMap<string, string> = new Map([
		['vscode-ripgrep', '@vscode/ripgrep'],
		['vscode-windows-registry', '@vscode/windows-registry'],
	]);

	private readonly re?: RegExp;

	constructor(@IExtHostInitDataService initData: IExtHostInitDataService) {
		if (initData.environment.appRoot && NodeModuleAliasingModuleFactory.aliased.size) {
			const root = escapeRegExpCharacters(this.forceForwardSlashes(initData.environment.appRoot.fsPath));
			// decompose ${appRoot}/node_modules/foo/bin to ['${appRoot}/node_modules/', 'foo', '/bin'],
			// and likewise the more complex form ${appRoot}/node_modules.asar.unpacked/@vcode/foo/bin
			// to ['${appRoot}/node_modules.asar.unpacked/',' @vscode/foo', '/bin'].
			const npmIdChrs = `[a-z0-9_.-]`;
			const npmModuleName = `@${npmIdChrs}+\\/${npmIdChrs}+|${npmIdChrs}+`;
			const moduleFolders = 'node_modules|node_modules\\.asar(?:\\.unpacked)?';
			this.re = new RegExp(`^(${root}/${moduleFolders}\\/)(${npmModuleName})(.*)$`, 'i');
		}
	}

	public alternativeModuleName(name: string): string | undefined {
		if (!this.re) {
			return;
		}

		const result = this.re.exec(this.forceForwardSlashes(name));
		if (!result) {
			return;
		}

		const [, prefix, moduleName, suffix] = result;
		const dealiased = NodeModuleAliasingModuleFactory.aliased.get(moduleName);
		if (dealiased === undefined) {
			return;
		}

		console.warn(`${moduleName} as been renamed to ${dealiased}, please update your imports`);

		return prefix + dealiased + suffix;
	}

	private forceForwardSlashes(str: string) {
		return str.replace(/\\/g, '/');
	}
}

//#endregion

//#region --- vscode-module

class VSCodeNodeModuleFactory implements INodeModuleFactory {
	public readonly nodeModuleName = 'vscode';

	private readonly _extApiImpl = new ExtensionIdentifierMap<typeof vscode>();
	private _defaultApiImpl?: typeof vscode;

	constructor(
		private readonly _apiFactory: IExtensionApiFactory,
		private readonly _extensionPaths: ExtensionPaths,
		private readonly _extensionRegistry: IExtensionRegistries,
		private readonly _configProvider: ExtHostConfigProvider,
		private readonly _logService: ILogService,
	) {
	}

	public load(_request: string, parent: URI): any {

		// get extension id from filename and api for extension
		const ext = this._extensionPaths.findSubstr(parent);
		if (ext) {
			let apiImpl = this._extApiImpl.get(ext.identifier);
			if (!apiImpl) {
				apiImpl = this._apiFactory(ext, this._extensionRegistry, this._configProvider);
				this._extApiImpl.set(ext.identifier, apiImpl);
			}
			return apiImpl;
		}

		// fall back to a default implementation
		if (!this._defaultApiImpl) {
			let extensionPathsPretty = '';
			this._extensionPaths.forEach((value, index) => extensionPathsPretty += `\t${index} -> ${value.identifier.value}\n`);
			this._logService.warn(`Could not identify extension for 'vscode' require call from ${parent}. These are the extension path mappings: \n${extensionPathsPretty}`);
			this._defaultApiImpl = this._apiFactory(nullExtensionDescription, this._extensionRegistry, this._configProvider);
		}
		return this._defaultApiImpl;
	}
}

//#endregion

//#region --- opn/open-module

interface OpenOptions {
	wait: boolean;
	app: string | string[];
}

interface IOriginalOpen {
	(target: string, options?: OpenOptions): Thenable<any>;
}

interface IOpenModule {
	(target: string, options?: OpenOptions): Thenable<void>;
}

class OpenNodeModuleFactory implements INodeModuleFactory {

	public readonly nodeModuleName: string[] = ['open', 'opn'];

	private _extensionId: string | undefined;
	private _original?: IOriginalOpen;
	private _impl: IOpenModule;
	private _mainThreadTelemetry: MainThreadTelemetryShape;

	constructor(
		private readonly _extensionPaths: ExtensionPaths,
		private readonly _appUriScheme: string,
		@IExtHostRpcService rpcService: IExtHostRpcService,
	) {

		this._mainThreadTelemetry = rpcService.getProxy(MainContext.MainThreadTelemetry);
		const mainThreadWindow = rpcService.getProxy(MainContext.MainThreadWindow);

		this._impl = (target, options) => {
			const uri: URI = URI.parse(target);
			// If we have options use the original method.
			if (options) {
				return this.callOriginal(target, options);
			}
			if (uri.scheme === 'http' || uri.scheme === 'https') {
				return mainThreadWindow.$openUri(uri, target, { allowTunneling: true });
			} else if (uri.scheme === 'mailto' || uri.scheme === this._appUriScheme) {
				return mainThreadWindow.$openUri(uri, target, {});
			}
			return this.callOriginal(target, options);
		};
	}

	public load(request: string, parent: URI, original: LoadFunction): any {
		// get extension id from filename and api for extension
		const extension = this._extensionPaths.findSubstr(parent);
		if (extension) {
			this._extensionId = extension.identifier.value;
			this.sendShimmingTelemetry();
		}

		this._original = original(request);
		return this._impl;
	}

	private callOriginal(target: string, options: OpenOptions | undefined): Thenable<any> {
		this.sendNoForwardTelemetry();
		return this._original!(target, options);
	}

	private sendShimmingTelemetry(): void {
		if (!this._extensionId) {
			return;
		}
		type ShimmingOpenClassification = {
			owner: 'jrieken';
			comment: 'Know when the open-shim was used';
			extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension is question' };
		};
		this._mainThreadTelemetry.$publicLog2<{ extension: string }, ShimmingOpenClassification>('shimming.open', { extension: this._extensionId });
	}

	private sendNoForwardTelemetry(): void {
		if (!this._extensionId) {
			return;
		}
		type ShimmingOpenCallNoForwardClassification = {
			owner: 'jrieken';
			comment: 'Know when the open-shim was used';
			extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension is question' };
		};
		this._mainThreadTelemetry.$publicLog2<{ extension: string }, ShimmingOpenCallNoForwardClassification>('shimming.open.call.noForward', { extension: this._extensionId });
	}
}

//#endregion
