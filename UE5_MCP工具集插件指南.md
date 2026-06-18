# UE5.8 MCP 工具集插件启用指南

要让 YB-AI 能够通过 MCP 调用 UE 编辑器的各种功能（创建蓝图、编辑关卡、操作材质等），需要在 UE5.8 编辑器中启用对应的工具集插件。

## 前置条件

以下 **2 个基础插件**必须启用（官方文档明确要求）：

| 插件 | 路径 | 说明 |
|------|------|------|
| `Toolset Registry` | `Engine/Plugins/Experimental/ToolsetRegistry/` | 工具注册与执行层 |
| `Unreal MCP` | `Engine/Plugins/Experimental/ModelContextProtocol/` | MCP 服务端（HTTP + JSON-RPC） |

## 工具集插件清单

以下所有插件位于 `Engine/Plugins/Experimental/Toolsets/` 目录。

在 UE 编辑器中按 `Ctrl+Shift+F5` 或 **编辑 → 插件**，搜索 `Toolsets` 找到它们。

### 关键推荐（常用）

| 插件名 | 功能 | 建议 |
|--------|------|------|
| **`MVCBlueprintToolset`** | **蓝图工具（47项操作）** — 创建/编辑蓝图、节点图、变量、组件、GAS | ⭐ 必开 |
| **`ScriptBlueprintToolset`** | **脚本蓝图工具** | ⭐ 必开 |
| **`StaticMeshToolset`** | **静态网格工具** — 网格创建、编辑、导入 | ⭐ 强烈推荐 |
| **`EditorScriptingToolset`** | **编辑器脚本** — Python/蓝图控制编辑器 | ⭐ 强烈推荐 |
| **`GeometryScriptingToolset`** | **几何体脚本** — 几何体操作 | ⭐ 推荐 |
| **`ModelingModeToolset`** | **建模模式** — 编辑器建模功能 | ⭐ 推荐 |
| **`PCGToolset`** | **PCG 程序化生成** — 程序化内容生成 | 👍 需要时开 |

### 动画与角色

| 插件名 | 功能 | 建议 |
|--------|------|------|
| `AnimationAssistantToolset` | 动画工具（依赖 ControlRig/SequencerScripting） | 🟡 需要时可开 |
| `RigVMBlueprintToolset` | RigVM 蓝图 | 🟡 需要时可开 |

### UI 与界面

| 插件名 | 功能 | 建议 |
|--------|------|------|
| `SlateUICalloutToolset` | UI 工具 | 🟡 需要时可开 |
| `UIFrontendToolset` | UI 前端 | 🟡 需要时可开 |
| `ToolImagesToolset` | 图像工具 | 🟡 需要时可开 |

### 其他领域

| 插件名 | 功能 | 建议 |
|--------|------|------|
| `ConversationToolset` | 对话系统 | 🟡 需要时可开 |
| `GameplayCueToolset` | GameplayCue | 🟡 需要时可开 |
| `LayerToolset` | 图层管理 | 🟡 需要时可开 |
| `SmartObjectToolset` | SmartObject | 🟡 需要时可开 |
| `WorldConditionToolset` | 世界条件 | 🟡 需要时可开 |
| `MVCComponentToolset` | 组件工具 | 🟡 需要时可开 |
| `AutomationTestToolset` | 自动化测试 | 🟡 需要时可开 |
| `AIModuleToolset` | AI 模块（当前暂无暴露工具） | 🔴 暂不需要 |
| `LogsToolset` | 日志系统（内置，自动注册） | ✅ 无需操作 |

## 快捷操作

### 方法 1：逐个启用

1. UE 编辑器：**编辑 → 插件**
2. 搜索栏输入：`Toolsets`
3. 勾选需要的工具集插件
4. 重启编辑器

### 方法 2：启用 All Toolsets（推荐）

如果不想一个个找，搜索并启用 **`All Toolsets`** 插件，它会加载所有工具集。

### 方法 3：通过控制台命令

在 UE 编辑器输出日志的控制台输入：
```
ModelContextProtocol.GenerateClientConfig All
```
这会为所有支持的 AI 客户端生成配置文件。

## 验证是否生效

启用并重启后，用 YB-AI 加载技能：

```
/ue5-mcp
```

AI 会自动发现所有已注册的工具集。如果看到类似输出：

```
[MCP] 发现 3 个工具集, 共 25 个工具 ✓
[MCP] 工具集: UEditorAppToolset, UAgentSkillToolset, ULogsToolset
```

说明基础工具集在工作。如果启用 `MVCBlueprintToolset` 后：

```
[MCP] 发现 4 个工具集, 共 72 个工具 ✓
[MCP] 工具集: UEditorAppToolset, UAgentSkillToolset, ULogsToolset, MVCBlueprintToolset
```

## 常见问题

### Q: 我启用了插件但工具集没出现？
A: 重启编辑器。部分工具集插件需要编辑器完全重启才能注册。

### Q: `list_toolsets` 只返回 AgentSkillToolset？
A: 说明只有基础插件在工作，检查是否启用了对应的工具集插件。

### Q: 项目切换后工具集没了？
A: 工具集插件是按项目启用的。每个项目都需要单独启用。

### Q: 端口 8000 被占用了怎么办？
A: 在 UE 偏好设置中修改 `ModelContextProtocol` 的端口号，同步修改 YB-AI 的 MCP 配置。
