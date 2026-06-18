# YB-AI: Unreal Engine 5.8 Native MCP Plugin AI Assistant

YB-AI is an AI assistant built upon the Deep Code CLI project, specifically designed for Unreal Engine 5.8's native MCP (Model Context Protocol) plugin, enabling AI agents to directly control the editor's geometry and other resources.

## Project Background

Unreal Engine 5.8 introduced a native MCP plugin, providing powerful capabilities for AI assistants to directly operate the editor. This project solves known issues in the tool calling pipeline (server hangs, editor crashes) and provides a stable, efficient AI assistant for interacting with the UE5.8 editor.

## Main Improvements

### 1. HTTP Transport Mode
- Added `HttpMcpClient` class supporting HTTP connection to UE5.8's built-in MCP server
- Implemented SSE (Server-Sent Events) listener for real-time server push notifications
- SessionId management for connection stability

### 2. Enhanced MCP Client
- Full JSON-RPC 2.0 protocol support over HTTP POST
- Automatic SSE stream parsing for tool responses
- Session management via `Mcp-Session-Id` response header

### 3. UE5.8 Toolset Support
- Auto-discovery of all UE5.8 MCP toolsets at session start
- Support for 20+ domain toolset plugins (Blueprint, Scene, Asset, Material, etc.)
- Unified `call_tool` dispatcher for all toolset tools
- Smart plugin guidance when required toolsets are not detected

### 4. Improved Logging
- Logs no longer print to console, keeping the interface clean
- Log files saved to `~/.deepcode/logs/` with timestamps
- Controlled via `debugLogEnabled` in settings.json (default: false)

## Quick Start

### Prerequisites

1. **Unreal Engine 5.8**: Installed and running
2. **Enable MCP Plugins**: Enable `ModelContextProtocol` and `ToolsetRegistry` plugins in the editor
3. **Enable Toolset Plugins** (for specific features): Enable `MVCBlueprintToolset`, `StaticMeshToolset`, etc. via **Edit → Plugins**
4. **Node.js**: v22 or higher

### Installation

```bash
npm install
npm run build
```

### Configuration

Edit `~/.deepcode/settings.json`:

```json
{
  "env": {
    "MODEL": "deepseek-v4-pro",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-your-api-key"
  },
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

UE5 MCP configuration is built-in! The system automatically adds the default UE5 config (`http://localhost:8000/mcp`) when no MCP servers are configured.

### Run

1. Ensure UE5.8 editor is running with MCP plugin active
2. Run:
   ```bash
   npm start
   ```
3. Load the skill: `/ue5-mcp`
4. The AI will auto-discover all available toolsets and report them

## Features

### UE5 MCP Skill
- **Auto-loaded on startup**: Automatically discovers all registered toolsets
- **Runtime discovery**: Calls `list_toolsets` + `describe_toolset` for each session
- **Concise logging**: Each MCP call outputs `[MCP] tool → result`
- **Smart error handling**: Skips non-existent methods, retries on timeout

### Toolset Plugins (Enable via Edit → Plugins)

| Plugin | Function |
|--------|----------|
| `MVCBlueprintToolset` | Blueprint tools (53 operations) |
| `StaticMeshToolset` | Static mesh tools |
| `EditorScriptingToolset` | Editor scripting |
| `SceneTools` | Scene/Actor manipulation |
| `MaterialTools` | Material creation/editing |
| `PCGToolset` | Procedural content generation |
| `AnimationAssistantToolset` | Animation tools |
| ... and 15+ more | Diverse UE editor toolsets |

### Slash Commands

| Command | Action |
|---------|--------|
| `/ue5-mcp` | Load UE5 MCP skill |
| `/skills` | List available skills |
| `/mcp` | View MCP server status |
| `/new` | Start new conversation |
| `/model` | Switch model/thinking mode |

## Deployment Options

### Portable Mode (Recommended for UE Integration)
Copy these to any folder:
- `dist/` - Built CLI
- `templates/` - Templates
- `nodejs/` - Portable Node.js runtime
- `YB-AI-Manager.exe` - UI manager (optional)

### UI Manager
A lightweight C# WinForms UI manager for multiple UE project management. See `ui/` directory.

## Documentation

- [UE5.8 MCP Toolset Plugin Guide](./UE5_MCP工具集插件指南.md) (Chinese) - Details on enabling all toolset plugins
- [Portable Deployment Guide](./便携版部署说明.md) (Chinese)
- [UI Manager Build Guide](./ui/编译说明.md) (Chinese)

## License

MIT

---

**Let AI become your Unreal Engine development partner!**
