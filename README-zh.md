# YB-AI：Unreal Engine 5.8 原生 MCP 插件 AI 助手

YB-AI 是一个基于 Deep Code CLI 项目改进而来的 AI 助手，专门为 Unreal Engine 5.8 的原生 MCP（Model Context Protocol）插件设计，让智能体能够直接操控编辑器中的几何体和其他资源。

## 项目背景

Unreal Engine 5.8 预览版引入了原生的 MCP 插件，为 AI 助手直接操作编辑器提供了强大的能力。然而，该插件在工具调用路径上存在一些已知问题，导致工具调用时服务器挂起或编辑器崩溃。本项目旨在解决这些问题，提供一个稳定、高效的 AI 助手来与 UE5.8 编辑器进行交互。

## 主要改进

### 1. 支持 HTTP 传输模式
- 添加了 `HttpMcpClient` 类，支持通过 HTTP 连接到 UE5.8 内置的 MCP 服务器
- 实现了 SSE（Server-Sent Events）监听机制，支持实时接收服务器推送的通知
- 支持 sessionId 管理，确保连接的稳定性

### 2. 扩展配置系统
- 更新了 `McpServerConfig` 类型，支持两种传输模式：
  - `stdio`：传统的标准输入/输出传输（向后兼容）
  - `http`：HTTP 传输模式，用于连接 UE5.8 内置 MCP 插件
- 更新了配置合并逻辑，正确处理两种模式的配置

### 3. 统一客户端接口
- 定义了统一的客户端接口类型，确保两种模式的客户端可以无缝切换
- 所有 MCP 管理器代码已更新，支持两种类型的客户端

### 4. 改进的日志系统
- 日志不再打印到控制台，保持界面整洁
- 日志文件自动保存到 `~/.deepcode/logs/` 目录，文件名带时间戳（例如：`debug-20260605123456.log`）
- 通过 `~/.deepcode/settings.json` 中的 `debugLogEnabled` 字段控制是否启用（默认为 false）

## 快速开始

### 前置条件

1. **Unreal Engine 5.8 预览版**：安装并运行
2. **启用 MCP 插件**：在编辑器中启用 `ModelContextProtocol` 和 `ToolsetRegistry` 插件
3. **配置插件**：设置插件自动启动，监听端口为 8000（或你选择的其他端口）
4. **Node.js 环境**：安装 Node.js 22 或更高版本

### 安装和配置

1. 克隆或下载本项目
2. 安装依赖：
   ```bash
   npm install
   ```
3. 构建项目：
   ```bash
   npm run build
   ```
4. 配置 Deep Code CLI 设置：
   
   编辑 `~/.deepcode/settings.json`（Windows：`%USERPROFILE%\.deepcode\settings.json`），至少需要配置 API 密钥：
   
   ```json
   {
     "env": {
       "MODEL": "deepseek-v4-pro",
       "BASE_URL": "https://api.deepseek.com",
       "API_KEY": "sk-你的API密钥"
     },
     "thinkingEnabled": true,
     "reasoningEffort": "max"
   }
   ```

   **注意**：UE5 MCP 配置已内置！当你没有配置任何 MCP 服务器时，系统会自动添加默认的 UE5 配置（连接到 `http://localhost:8000/mcp`）。如果你想自定义配置，可以手动添加：

   ```json
   {
     "mcpServers": {
       "ue5": {
         "type": "http",
         "url": "http://localhost:8000/mcp"
       }
     }
   }
   ```

### 运行

1. 确保 UE5.8 编辑器已启动，并且 MCP 插件正在运行
2. 运行 Deep Code CLI：
   ```bash
   npm start
   # 或
   node dist/cli.js
   ```
3. 使用 `/mcp` 命令检查 MCP 服务器连接状态
4. 开始与 AI 助手对话，让它帮你操作 UE5.8 编辑器！

## 可用功能

一旦连接成功，你可以让 AI 助手：

- **列出可用工具集**：查看 UE5.8 编辑器提供的所有工具集（toolsets）
- **加载工具集**：加载特定的工具集以使用其功能
- **场景操作**：
  - 查找场景中的 Actor
  - 从资产添加到场景
  - 创建基本几何体（立方体、球体、圆柱体等）
  - 移动、旋转和缩放对象
- **资产管理**：浏览、导入和导出资源
- **蓝图编辑**：修改蓝图图表和属性
- **以及更多**：探索 UE5.8 MCP 插件提供的所有功能

## 已知问题与解决方案

### UE5.8 MCP 插件工具调用问题

社区报告显示，UE5.8 预览版中的 MCP 插件在执行工具调用时可能会遇到以下问题：

1. **服务器挂起**：HTTP 监听套接字开始堆积未接受的连接
2. **编辑器崩溃**：在某些情况下会触发断言失败

**临时解决方案**：
- 首先使用只读操作（如 `tools/list`、`initialize` 等）验证连接
- 如果遇到崩溃，重启 UE5.8 编辑器
- 关注 Epic Games 的官方更新，以获取修复版本

## 项目结构

主要修改和新增的文件：

```
src/
├── mcp/
│   ├── mcp-client.ts    # 新增 HttpMcpClient 类
│   └── mcp-manager.ts   # 更新以支持两种传输模式
├── settings.ts          # 更新配置类型定义
docs/
└── mcp.md              # 更新文档，添加 HTTP 模式说明
```

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 格式化代码
npm run format

# 构建项目
npm run build

# 运行测试
npm test
```

---

## （强烈推荐）使用 PowerShell UI 管理器（超轻量！无需编译！）

> **超级推荐！** 这是一个 **只有几 KB** 的图形化界面项目管理器！无需安装 .NET，无需编译，Windows 自带 PowerShell 直接运行！

### 功能特点

- 📁 **项目管理**：添加、编辑、删除多个 UE 项目
- 🎯 **关联项目**：每个项目对应一个 .uproject 文件
- 🚀 **一键启动**：点击运行按钮，自动以项目目录为工作目录启动 YB-AI
- 📋 **方便复制**：底部显示 `ModelContextProtocol.StartServer` 命令，点击即可复制
- 💾 **超轻量**：只有几 KB，无需任何依赖

### 使用方法

1. 确保 `nodejs`、`dist`、`templates` 目录都在同一个位置
2. 直接双击 **`启动管理器.bat`**（或 `YB-AI-Manager.ps1`）
3. 点击「+ 新建项目」，选择你的 .uproject 文件并命名
4. 点击项目卡片上的「▶ 运行」按钮即可启动！

---

## （备选）C# UI 管理器

如果你确实需要 .exe 文件，可以使用 C# 版本（但需要编译，体积较大）。详细见 `ui/编译说明.md`。

---

## （可选）便携版方案（无需安装 Node.js）

> **推荐！**这是最简单、最可靠的方案，无需任何打包工具，完美兼容所有 Node.js 版本！

### 什么是便携版？

便携版将所有必需文件打包在一个文件夹中，可以复制到任何 Windows 电脑上直接运行，无需安装 Node.js！

### 部署步骤

#### 1. 在开发机上构建项目

在原项目目录下运行：

```bash
npm run build
```

#### 2. 准备便携版文件夹

在你喜欢的位置创建一个文件夹（例如 `YB-AI-Portable`），然后复制以下文件/目录：

```
YB-AI-Portable/
├── YB-AI启动.bat          <-- 项目根目录下的启动脚本
├── YB-AI-Manager.exe      <-- UI 管理器（可选，编译后复制）
├── nodejs/                <-- 整个 Node.js 便携版目录
├── dist/                  <-- 项目根目录下的整个目录
│   └── cli.js
└── templates/             <-- 项目根目录下的整个目录
    ├── prompts/
    ├── skills/
    └── tools/
```

#### 3. 获取 Node.js 便携版

你已经有了！在项目根目录下的 `nodejs` 文件夹就是。

#### 4. 运行

- 双击 `YB-AI-Manager.exe` 使用图形界面（推荐）
- 或双击 `YB-AI启动.bat` 直接启动 CLI 版本

---

## （备选）nexe 打包方案（不推荐）

如果你确实需要单个可执行文件，可以尝试 nexe，但可能遇到网络问题：

```bash
# 打包成 Windows 可执行文件 (.exe)
npm run package:win
```

---

## 与 UE 对接提示

1. 使用 UI 管理器或便携版方案，将整个文件夹放在 UE 项目中
2. 通过 UE 的命令行功能调用 `YB-AI-Manager.exe` 或 `YB-AI启动.bat`
3. 所有配置和日志保存在用户目录 `~/.deepcode/` 下，文件夹可随意移动

详细说明请查看：
- [便携版部署说明.md](./便携版部署说明.md)
- [ui/编译说明.md](./ui/编译说明.md)

## 贡献

欢迎贡献！我们特别需要：

1. 测试不同平台（Windows、macOS、Linux）上的 UE5.8 MCP 集成
2. 报告和修复与 UE5.8 MCP 插件交互时的问题
3. 增强功能和改进稳定性
4. 文档改进

## 致谢

- 感谢 Deep Code CLI 项目提供的优秀基础
- 感谢 Unreal Engine 团队开发原生 MCP 插件
- 感谢社区用户分享他们在 UE5.8 MCP 方面的经验

## 许可证

本项目继承 Deep Code CLI 的许可证。

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 Issue
- 发送 Pull Request

---

**让 AI 成为你的 Unreal Engine 开发伙伴！** 🎮✨
