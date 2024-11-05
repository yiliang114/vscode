/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// monaco 的 API 导出
import './editor.all.js';
// vs/editor/standalone 只是用来把核心编辑器独立打包成 Monaco 的一个壳。它不会被任何模块依赖。
import './standalone/browser/iPadShowKeyboard/iPadShowKeyboard.js'; // iPad 键盘
import './standalone/browser/inspectTokens/inspectTokens.js';
import './standalone/browser/quickAccess/standaloneHelpQuickAccess.js';
import './standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js';
import './standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js';
import './standalone/browser/quickAccess/standaloneCommandsQuickAccess.js';
import './standalone/browser/referenceSearch/standaloneReferenceSearch.js';
import './standalone/browser/toggleHighContrast/toggleHighContrast.js';

export * from './editor.api.js';
