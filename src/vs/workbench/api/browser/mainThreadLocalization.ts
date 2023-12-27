/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadLocalizationShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';

@extHostNamedCustomer(MainContext.MainThreadLocalization)
export class MainThreadLocalization extends Disposable implements MainThreadLocalizationShape {

	constructor(
		extHostContext: IExtHostContext,
		@IFileService private readonly fileService: IFileService,
		@ILanguagePackService private readonly languagePackService: ILanguagePackService
	) {
		super();
	}

	// 获取内建扩展的 bundle 文件 uri.
	// TODO: 如果记得没错的话，应该是需要通过应用市场获取 uri 的。
	async $fetchBuiltInBundleUri(id: string, language: string): Promise<URI | undefined> {
		try {
			const uri = await this.languagePackService.getBuiltInExtensionTranslationsUri(id, language);
			return uri;
		} catch (e) {
			return undefined;
		}
	}

	// 上一步获取到了本地化（bundle）文件的 uri，该函数就是通过 uri 获取文件的内容。
	// TODO: 大多数时候，uri 的 scheme 都是 http/https 的，通过远程请求 vscode-loc 的文件？
	async $fetchBundleContents(uriComponents: UriComponents): Promise<string> {
		const contents = await this.fileService.readFile(URI.revive(uriComponents));
		return contents.value.toString();
	}
}
