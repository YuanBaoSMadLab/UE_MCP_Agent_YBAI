# UE5.8 MCP Skill 安装包

将 UE5.8 MCP 插件的能力封装为一个专业技能（Skill），安装在 AI 编程助手中，减少 Token 消耗，加速工具调用。

## 目录结构

```
ue5-mcp-skill/
├── .agents/
│   └── skills/
│       └── ue5-mcp/
│           └── SKILL.md          # 核心技能文件
├── install.bat                    # Windows 安装脚本
├── mcp-servers-config.json        # 各 IDE 的 MCP 服务器配置
└── README.md                      # 本文件
```

## 安装

### 方式 1：一键安装（推荐）

双击 `install.bat`，选择目标 IDE 即可自动安装。

### 方式 2：手动安装

1. **DeepCode CLI**:
   - 将 `.agents/skills/ue5-mcp/` 复制到 `~/.agents/skills/` 或项目根目录的 `.agents/skills/`
   - 或复制到 `~/.deepcode/skills/ue5-mcp/SKILL.md`
   - 使用方法：在对话中输入 `/ue5-mcp` 或 `/skill ue5-mcp`

2. **Trae CN**:
   - 将 `SKILL.md` 放到团队/项目的技能目录中
   - 在 MCP 配置中添加服务器连接

3. **Cursor / Windsurf / CodeBuddy**:
   - 参考 `mcp-servers-config.json` 配置 MCP 服务器
   - 在项目中引用 SKILL.md

## 使用

安装后，在 DeepCode CLI 中：

```
> /ue5-mcp            # 加载 UE5 MCP 技能
> 帮我列出 UE5 的工具集  # AI 自动调用 list_toolsets
> 列出所有 AgentSkill   # AI 自动调用 ListSkills
```

## 配置 MCP 服务器

确保 UE5.8 编辑器已启动且 MCP 插件运行后，在 IDE 中配置 MCP 服务器连接（参考 `mcp-servers-config.json`）。
