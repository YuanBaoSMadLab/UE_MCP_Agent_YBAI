---
name: ue5-mcp
description: UE5.8 MCP 集成技能。自动发现并调用 UE 编辑器的所有工具集。加载后自动发现可用工具，直接执行操作。
---

# UE5.8 MCP 协议

## 响应
加载后：**"已加载 UE5 MCP ✓"** → 立即自动发现

## 自动发现
```
[MCP] tools/list → 3 个顶层工具
[MCP] call_tool(list_toolsets) → 列出所有工具集
[MCP] describe_toolset(每个工具集) → 列出工具详情和参数
[MCP] 发现 X 个工具集, 共 Y 个工具
```

后续直接调，不再重复发现。

## 调用方式

所有工具通过 `call_tool` 统一调度：
```
tools/call {
  name: "call_tool",
  arguments: {
    toolset_name: "工具集名",
    tool_name: "工具简短名",
    arguments: {}
  }
}
```

`tool_name` 用简短名（去掉命名空间前缀），`toolset_name` 用完整名。

## UE5.8 工具集体系

### 内置工具集（插件 Toolset Registry 自动注册）

| 工具集 | 说明 |
|--------|------|
| `UEditorAppToolset` | 编辑器状态、打开/保存关卡、资源导入导出 |
| `UAgentSkillToolset` | AI 技能 CRUD（ListSkills/GetSkills/CreateSkill/UpdateSkill/DeleteSkill） |
| `ULogsToolset` | 日志查询、过滤、实时流 |

### 领域工具集（需要启用对应的 Toolsets/* 插件）

每个工具集是一个独立的 UE 插件，位于 `Engine/Plugins/Experimental/Toolsets/`：

| 插件名 | 功能 |
|--------|------|
| `MVCBlueprintToolset` | **蓝图工具** — 创建/编辑蓝图、节点图、变量、组件、GAS |
| `ScriptBlueprintToolset` | **脚本蓝图工具** |
| `EditorScriptingToolset` | 编辑器脚本 |
| `StaticMeshToolset` | **静态网格工具** |
| `GeometryScriptingToolset` | 几何体脚本 |
| `ModelingModeToolset` | 建模模式 |
| `PCGToolset` | PCG 程序化生成 |
| `AnimationAssistantToolset` | 动画工具 |
| `ConversationToolset` | 对话系统 |
| `GameplayCueToolset` | GameplayCue |
| `LayerToolset` | 图层管理 |
| `SmartObjectToolset` | SmartObject |
| `WorldConditionToolset` | 世界条件 |
| `RigVMBlueprintToolset` | RigVM 蓝图 |
| `SlateUICalloutToolset` | UI 工具 |
| `UIFrontendToolset` | UI 前端 |
| `ToolImagesToolset` | 图像工具 |
| `MVCComponentToolset` | 组件工具 |
| `AIModuleToolset` | AI 模块 |
| `AutomationTestToolset` | 自动化测试 |

### 启用方法
在 UE 编辑器：**编辑 → 插件**，搜索 `Toolsets`，找到需要的工具集插件（如 `MVCBlueprintToolset`）并启用。

## 日志
每次 MCP 调用输出：
```
[MCP] list_toolsets → 结果
[MCP] describe_toolset(XX) → 结果
[MCP] call_tool(XX) → success/failed
```

## 行为
- 不编造不存在的工具
- 如果用户要求的操作没有对应工具，判断是哪个工具集缺失，提示：**"需要启用 UE 插件：XXX → 编辑 → 插件 → 搜索并启用，重启 UE"**
- 写操作先问用户

## 常用需求 → 所需插件对照

| 用户需求 | 需要的插件 |
|---------|-----------|
| 创建/编辑蓝图 | `MVCBlueprintToolset` |
| 创建关卡 | `UEditorAppToolset`（内置） |
| 创建/编辑静态网格 | `StaticMeshToolset` |
| 编辑器脚本/Python | `EditorScriptingToolset` |
| 几何体操作 | `GeometryScriptingToolset` |
| 建模 | `ModelingModeToolset` |
| PCG 程序化生成 | `PCGToolset` |
| 动画 | `AnimationAssistantToolset` |
| AI 技能管理 | `UAgentSkillToolset`（内置） |
