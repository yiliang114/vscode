/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createApiFactoryAndRegisterActors } from 'vs/workbench/api/common/extHost.api.impl';
import { ExtensionActivationTimesBuilder } from 'vs/workbench/api/common/extHostExtensionActivator';
import { AbstractExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { URI } from 'vs/base/common/uri';
import { RequireInterceptor } from 'vs/workbench/api/common/extHostRequireInterceptor';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtensionRuntime } from 'vs/workbench/api/common/extHostTypes';
import { timeout } from 'vs/base/common/async';
import { ExtHostConsoleForwarder } from 'vs/workbench/api/worker/extHostConsoleForwarder';

class WorkerRequireInterceptor extends RequireInterceptor {

	// Worker 中不做任何事？？？
	protected _installInterceptor() { }

	getModule(request: string, parent: URI): undefined | any {
		for (const alternativeModuleName of this._alternatives) {
			const alternative = alternativeModuleName(request);
			if (alternative) {
				request = alternative;
				break;
			}
		}

		if (this._factories.has(request)) {
			return this._factories.get(request)!.load(request, parent, () => { throw new Error('CANNOT LOAD MODULE from here.'); });
		}
		return undefined;
	}
}

// 扩展宿主服务: 运行扩展代码的环境，是一个独立的进程。
// 在 VSCode 的设计中，为了保持编辑器界面（UI）的响应性，它将扩展的执行和用户界面分开处理。扩展不直接在主 UI 进程中运行，而是在一个分离的 Extension Host 进程中执行。这样，即使某些扩展代码执行缓慢或者出现问题，也不会直接影响到编辑器的响应性或稳定性。
// 当你安装了新的扩展，VSCode 会在 Extension Host 进程中加载并运行这些扩展。该进程通过 IPC（Inter-Process Communication，进程间通信）与主 UI 进程通信，以实现诸如编辑器命令、事件监听等功能。
export class ExtHostExtensionService extends AbstractExtHostExtensionService {
	readonly extensionRuntime = ExtensionRuntime.Webworker;

	private _fakeModules?: WorkerRequireInterceptor;

	protected async _beforeAlmostReadyToRunExtensions(): Promise<void> {
		// make sure console.log calls make it to the render
		this._instaService.createInstance(ExtHostConsoleForwarder);

		// initialize API and register actors
		const apiFactory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);
		this._fakeModules = this._instaService.createInstance(WorkerRequireInterceptor, apiFactory, { mine: this._myRegistry, all: this._globalRegistry });
		await this._fakeModules.install();
		performance.mark('code/extHost/didInitAPI');

		await this._waitForDebuggerAttachment();
	}

	protected _getEntryPoint(extensionDescription: IExtensionDescription): string | undefined {
		return extensionDescription.browser;
	}

	protected async _loadCommonJSModule<T extends object | undefined>(extension: IExtensionDescription | null, module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
		module = module.with({ path: ensureSuffix(module.path, '.js') });
		const extensionId = extension?.identifier.value;
		if (extensionId) {
			performance.mark(`code/extHost/willFetchExtensionCode/${extensionId}`);
		}

		// First resolve the extension entry point URI to something we can load using `fetch`
		// This needs to be done on the main thread due to a potential `resourceUriProvider` (workbench api)
		// which is only available in the main thread
		const browserUri = URI.revive(await this._mainThreadExtensionsProxy.$asBrowserUri(module));
		const response = await fetch(browserUri.toString(true));
		if (extensionId) {
			performance.mark(`code/extHost/didFetchExtensionCode/${extensionId}`);
		}

		if (response.status !== 200) {
			throw new Error(response.statusText);
		}

		// fetch JS sources as text and create a new function around it
		const source = await response.text();
		// Here we append #vscode-extension to serve as a marker, such that source maps
		// can be adjusted for the extra wrapping function.
		const sourceURL = `${module.toString(true)}#vscode-extension`;
		const fullSource = `${source}\n//# sourceURL=${sourceURL}`;
		let initFn: Function;
		try {
			initFn = new Function('module', 'exports', 'require', fullSource); // CodeQL [SM01632] js/eval-call there is no alternative until we move to ESM
		} catch (err) {
			if (extensionId) {
				console.error(`Loading code for extension ${extensionId} failed: ${err.message}`);
			} else {
				console.error(`Loading code failed: ${err.message}`);
			}
			console.error(`${module.toString(true)}${typeof err.line === 'number' ? ` line ${err.line}` : ''}${typeof err.column === 'number' ? ` column ${err.column}` : ''}`);
			console.error(err);
			throw err;
		}

		if (extension) {
			await this._extHostLocalizationService.initializeLocalizedMessages(extension);
		}

		// define commonjs globals: `module`, `exports`, and `require`
		const _exports = {};
		const _module = { exports: _exports };
		const _require = (request: string) => {
			const result = this._fakeModules!.getModule(request, module);
			if (result === undefined) {
				throw new Error(`Cannot load module '${request}'`);
			}
			return result;
		};

		try {
			activationTimesBuilder.codeLoadingStart();
			if (extensionId) {
				performance.mark(`code/extHost/willLoadExtensionCode/${extensionId}`);
			}
			initFn(_module, _exports, _require);
			return <T>(_module.exports !== _exports ? _module.exports : _exports);
		} finally {
			if (extensionId) {
				performance.mark(`code/extHost/didLoadExtensionCode/${extensionId}`);
			}
			activationTimesBuilder.codeLoadingStop();
		}
	}

	async $setRemoteEnvironment(_env: { [key: string]: string | null }): Promise<void> {
		return;
	}

	private async _waitForDebuggerAttachment(waitTimeout = 5000) {
		// debugger attaches async, waiting for it fixes #106698 and #99222
		if (!this._initData.environment.isExtensionDevelopmentDebug) {
			return;
		}

		const deadline = Date.now() + waitTimeout;
		while (Date.now() < deadline && !('__jsDebugIsReady' in globalThis)) {
			await timeout(10);
		}
	}
}

function ensureSuffix(path: string, suffix: string): string {
	return path.endsWith(suffix) ? path : path + suffix;
}
