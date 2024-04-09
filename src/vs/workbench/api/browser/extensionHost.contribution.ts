/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

// --- other interested parties
import { JSONValidationExtensionPoint } from 'vs/workbench/api/common/jsonValidationExtensionPoint';
import { ColorExtensionPoint } from 'vs/workbench/services/themes/common/colorExtensionPoint';
import { IconExtensionPoint } from 'vs/workbench/services/themes/common/iconExtensionPoint';
import { TokenClassificationExtensionPoints } from 'vs/workbench/services/themes/common/tokenClassificationExtensionPoint';
import { LanguageConfigurationFileHandler } from 'vs/workbench/contrib/codeEditor/common/languageConfigurationExtensionPoint';
import { StatusBarItemsExtensionPoint } from 'vs/workbench/api/browser/statusBarExtensionPoint';

// TODO: 为什么明明是 extHost ，但是这里引入的却全都是主进程的服务呢？
// 为什么 browser 目录下都是主进程，而 common 下都是 extHost 进程？
// --- mainThread participants 主线程参与者
import './mainThreadLocalization'; // 本地化主进程
import './mainThreadBulkEdits'; // 批量编辑
import './mainThreadLanguageModels'; // 语言模型
import './mainThreadChatAgents2'; // 聊天 agent ？
import './mainThreadChatVariables'; // 聊天变量
import './mainThreadCodeInsets'; // 代码缩进
import './mainThreadCLICommands'; // CLI
import './mainThreadClipboard'; // 剪贴板
import './mainThreadCommands'; // 命令
import './mainThreadConfiguration'; // 配置
import './mainThreadConsole'; // 控制台
import './mainThreadDebugService'; // 调试
import './mainThreadDecorations'; // 装饰, 代码编辑器装饰？
import './mainThreadDiagnostics'; // 诊断
import './mainThreadDialogs'; // 对话框、弹框
import './mainThreadDocumentContentProviders'; // 文档内容提供
import './mainThreadDocuments'; // 文档
import './mainThreadDocumentsAndEditors'; // 文档和编辑器
import './mainThreadEditor'; // 编辑器
import './mainThreadEditors'; // 编辑器
import './mainThreadEditorTabs'; // 编辑器
import './mainThreadErrors'; // 错误
import './mainThreadExtensionService'; // 扩展
import './mainThreadFileSystem'; // 文件
import './mainThreadFileSystemEventService'; // 文件系统事件服务
import './mainThreadLanguageFeatures'; // 语言特性
import './mainThreadLanguages'; // 语言
import './mainThreadLogService'; // 日志服务
import './mainThreadMessageService'; // 消息服务
import './mainThreadManagedSockets'; // 托管套接字 ？？
import './mainThreadOutputService'; // 输出服务
import './mainThreadProgress'; // 进度
import './mainThreadQuickDiff'; // 快速对比主进程
import './mainThreadQuickOpen'; // 快速打开
import './mainThreadRemoteConnectionData'; // 远程连接
import './mainThreadSaveParticipant'; // 保存参与
import './mainThreadSpeech'; // 语音
import './mainThreadEditSessionIdentityParticipant'; // 编辑会话身份参与
import './mainThreadSCM'; // SCM
import './mainThreadSearch'; // 搜索
import './mainThreadStatusBar'; // 状态栏
import './mainThreadStorage'; // 存储
import './mainThreadTelemetry'; // 遥测，数据上报。。。
import './mainThreadTerminalService'; // 终端
import './mainThreadTerminalShellIntegration';
import './mainThreadTheming'; // 主题
import './mainThreadTreeViews'; // 树视图
import './mainThreadDownloadService'; // 下载服务
import './mainThreadUrls'; // 网址 ？？？？
import './mainThreadUriOpeners'; // 打开页面？？？
import './mainThreadWindow'; // 窗口，与 workbench 相关？
import './mainThreadWebviewManager'; // webview 管理器，维护所有已经创建的 webview
import './mainThreadWorkspace'; // 工作区
import './mainThreadComments'; // 评论
import './mainThreadNotebook'; // notebook
import './mainThreadNotebookKernels'; // notebook kernels
import './mainThreadNotebookDocumentsAndEditors'; // notebook 文档和编辑器
import './mainThreadNotebookRenderers'; // notebook 渲染器，也是类似 webview
import './mainThreadNotebookSaveParticipant'; // notebook 保存参与
import './mainThreadInteractive'; // 交互
import './mainThreadInlineChat'; // 内联聊天
import './mainThreadTask'; // 任务
import './mainThreadLabelService'; // 标签服务
import './mainThreadTunnelService'; // 隧道服务
import './mainThreadAuthentication'; // 认证、鉴权
import './mainThreadTimeline'; // 时间轴
import './mainThreadTesting'; // 测试
import './mainThreadSecretState'; // 秘钥状态
import './mainThreadShare'; // 分享
import './mainThreadProfileContentHandlers'; // 性能上报相关？？
import './mainThreadAiRelatedInformation'; // AI 相关信息
import './mainThreadAiEmbeddingVector'; // AI 嵌入向量

export class ExtensionPoints implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.extensionPoints';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		// Classes that handle extension points...
		this.instantiationService.createInstance(JSONValidationExtensionPoint);
		this.instantiationService.createInstance(ColorExtensionPoint);
		this.instantiationService.createInstance(IconExtensionPoint);
		this.instantiationService.createInstance(TokenClassificationExtensionPoints);
		this.instantiationService.createInstance(LanguageConfigurationFileHandler);
		this.instantiationService.createInstance(StatusBarItemsExtensionPoint);
	}
}

registerWorkbenchContribution2(ExtensionPoints.ID, ExtensionPoints, WorkbenchPhase.BlockStartup);
