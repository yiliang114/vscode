# Server

> 远程开发的服务器应用程序的入口点，负责处理远程开发的相关服务。

## 概念

- host ？
- remote
- agent
- cli

## 认知

- node 与 web 是如何链接的？ 如何通信的？ipc? WebSocket ?
- 既然 node 是单独的服务，两边是如何做到聚合的？ 如何通过 ipc ？直接访问 node 端的真实文件
- web 端本质上还是纯 Web 架构，而不包含后端服务，这与 vscode.dev 是一样的。（code-server 做了什么？）

## Code Server 比普通的版本多了哪些功能?

1. git 天然支持？ 不过内建扩展有时会处理失败 ？？file: 协议的文件系统.
2. Terminal
