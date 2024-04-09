/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// monaco 的 API 导出
import 'vs/editor/editor.all';
// vs/editor/standalone 只是用来把核心编辑器独立打包成 Monaco 的一个壳。它不会被任何模块依赖。
import 'vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard';
import 'vs/editor/standalone/browser/inspectTokens/inspectTokens';
import 'vs/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess';
import 'vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess';
import 'vs/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess';
import 'vs/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess';
import 'vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch';
import 'vs/editor/standalone/browser/toggleHighContrast/toggleHighContrast';

export * from 'vs/editor/editor.api';
