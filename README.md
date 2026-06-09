# UE_MCP_Agent_YBAI: Unreal Engine 5.8 Native MCP Plugin AI Assistant
An intelligent agent project based on deepcode cli dedicated to MCP server for UE5.8
Here is the English version of your README. I’ve kept the structure identical to your Chinese version and added the link to `README-zh.md` at the very top, as requested.

***

> **./README-zh.md**

YB-AI is an AI assistant derived from the Deep Code CLI project, specifically designed for the native MCP (Model Context Protocol) plugin in Unreal Engine 5.8. It enables intelligent agents to directly manipulate geometry and other assets within the editor.

## Project Background

The Unreal Engine 5.8 Preview introduces a native MCP plugin, providing powerful capabilities for AI assistants to operate the editor directly. However, there are known issues with tool invocation paths that can cause the server to hang or the editor to crash during tool calls. This project aims to solve these problems by providing a stable and efficient AI assistant for interacting with the UE5.8 editor.

## Key Improvements

### 1. HTTP Transport Mode Support
- Added the `HttpMcpClient` class to support connecting to the UE5.8 built-in MCP server via HTTP.
- Implemented an SSE (Server-Sent Events) listening mechanism to support real-time push notifications from the server.
- Supports `sessionId` management to ensure connection stability.

### 2. Extended Configuration System
- Updated the `McpServerConfig` type to support two transport modes:
    - `stdio`: Traditional standard input/output transport (backward compatible).
    - `http`: HTTP transport mode for connecting to the UE5.8 native MCP plugin.
- Updated configuration merging logic to correctly handle both modes.

### 3. Unified Client Interface
- Defined a unified client interface type to ensure seamless switching between the two modes.
- All MCP manager code has been updated to support both client types.

### 4. Improved Logging System
- Logs are no longer printed to the console, keeping the interface clean.
- Log files are automatically saved to the `~/.deepcode/logs/` directory with timestamped filenames (e.g., `debug-20260605123456.log`).
- Controlled via the `debugLogEnabled` field in `~/.deepcode/settings.json` (default is `false`).

## Quick Start

### Prerequisites

1.  **Unreal Engine 5.8 Preview**: Installed and running.
2.  **Enable MCP Plugins**: Enable the `ModelContextProtocol` and `ToolsetRegistry` plugins in the editor.
3.  **Configure Plugin**: Set the plugin to auto-start, listening on port `8000` (or your chosen port).
4.  **Node.js Environment**: Install Node.js 22 or higher.

### Installation & Configuration

1.  Clone or download this repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```
4.  Configure Deep Code CLI settings:

    Edit `~/.deepcode/settings.json` (Windows: `%USERPROFILE%\.deepcode\settings.json`). You must configure at least the API key:

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

    **Note**: The UE5 MCP configuration is **built-in**! If you do not configure any MCP servers, the system automatically adds the default UE5 config (connecting to `http://localhost:8000/mcp`). To customize, manually add:

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

### Running

1.  Ensure the UE5.8 editor is running and the MCP plugin is active.
2.  Run the Deep Code CLI:
    ```bash
    npm start
    # or
    node dist/cli.js
    ```
3.  Use the `/mcp` command to check the MCP server connection status.
4.  Start chatting with the AI assistant and let it help you operate the UE5.8 editor!

## Available Features

Once connected, you can ask the AI assistant to:

-   **List available toolsets**: View all toolsets provided by the UE5.8 editor.
-   **Load toolsets**: Load specific toolsets to use their functions.
-   **Scene Operations**:
    -   Find Actors in the scene.
    -   Add assets to the scene.
    -   Create basic geometry (cubes, spheres, cylinders, etc.).
    -   Move, rotate, and scale objects.
-   **Asset Management**: Browse, import, and export assets.
-   **Blueprint Editing**: Modify blueprint graphs and properties.
-   **And more**: Explore all features provided by the UE5.8 MCP plugin.

## Known Issues & Solutions

### UE5.8 MCP Plugin Tool Invocation Issues

Community reports indicate that the MCP plugin in UE5.8 Preview may encounter the following issues during tool execution:

1.  **Server Hang**: HTTP listener sockets start accumulating unaccepted connections.
2.  **Editor Crash**: May trigger assertion failures in certain scenarios.

**Temporary Workarounds**:
-   First, use read-only operations (like `tools/list`, `initialize`) to verify connectivity.
-   If a crash occurs, restart the UE5.8 editor.
-   Watch for official updates from Epic Games for fixed versions.

## Project Structure

Main modified and newly added files:

```
src/
├── mcp/
│   ├── mcp-client.ts    # New HttpMcpClient class
│   └── mcp-manager.ts   # Updated to support both transport modes
├── settings.ts          # Updated configuration type definitions
docs/
└── mcp.md              # Updated documentation with HTTP mode instructions
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Lint code
npm run lint

# Format code
npm run format

# Build project
npm run build

# Run tests
npm test
```

---

## (Highly Recommended) PowerShell UI Manager (Ultra Lightweight!)

> **Super recommended!** A **few KB only** graphical UI project manager! No .NET installation needed, no compilation required—runs directly with Windows PowerShell!

### Features

- 📁 **Project Management**: Add, edit, and delete multiple UE projects.
- 🎯 **Project Association**: Each project links to one `.uproject` file.
- 🚀 **One-Click Launch**: Click the run button to automatically start YB-AI with the project directory as the working directory.
- 📋 **Easy Copy**: Displays the `ModelContextProtocol.StartServer` command at the bottom; click to copy.
- 💾 **Ultra Lightweight**: Only a few KB, zero dependencies.

### Usage

1.  Ensure `nodejs`, `dist`, and `templates` directories are in the same location.
2.  Double-click **`Launch Manager.bat`** (or `YB-AI-Manager.ps1`).
3.  Click "+ New Project", select your `.uproject` file, and name it.
4.  Click the "▶ Run" button on the project card to start!

---

## (Alternative) C# UI Manager

If you strictly need an `.exe` file, you can use the C# version (requires compilation, larger size). See `ui/BuildInstructions.md` for details.

---

## (Optional) Portable Version (No Node.js Installation Required)

> **Recommended!** The simplest and most reliable solution. No packaging tools needed, fully compatible with all Node.js versions!

### What is the Portable Version?

The portable version packages all necessary files into one folder. You can copy it to any Windows PC and run it immediately without installing Node.js!

### Deployment Steps

#### 1. Build the Project on Your Dev Machine

Run in the original project directory:

```bash
npm run build
```

#### 2. Prepare the Portable Folder

Create a folder (e.g., `YB-AI-Portable`) and copy the following files/directories:

```
YB-AI-Portable/
├── YB-AI-Launcher.bat      <-- Launcher script from project root
├── YB-AI-Manager.exe       <-- UI Manager (optional, copy after compiling)
├── nodejs/                 <-- Entire Node.js portable directory
├── dist/                   <-- Entire directory from project root
│   └── cli.js
└── templates/              <-- Entire directory from project root
    ├── prompts/
    ├── skills/
    └── tools/
```

#### 3. Get Node.js Portable

You already have it! The `nodejs` folder in the project root is the portable version.

#### 4. Run

- Double-click `YB-AI-Manager.exe` to use the GUI (Recommended).
- Or double-click `YB-AI-Launcher.bat` to launch the CLI version directly.

---

## (Alternative) nexe Packaging (Not Recommended)

If you absolutely need a single executable file, you can try nexe, though network issues may occur:

```bash
# Package into Windows executable (.exe)
npm run package:win
```

---

## UE Integration Tips

1.  Use the UI Manager or Portable version and place the entire folder inside your UE project.
2.  Call `YB-AI-Manager.exe` or `YB-AI-Launcher.bat` via UE's command-line features.
3.  All configurations and logs are saved in the user directory (`~/.deepcode/`), allowing the folder to be moved freely.

For detailed instructions, see:
- ./Portable%20Deployment%20Guide.md
- ./ui/BuildInstructions.md

## Contributing

Contributions are welcome! We especially need help with:

1.  Testing UE5.8 MCP integration on different platforms (Windows, macOS, Linux).
2.  Reporting and fixing interaction issues with the UE5.8 MCP plugin.
3.  Enhancing features and improving stability.
4.  Improving documentation.

## Acknowledgements

- Thanks to the Deep Code CLI project for the excellent foundation.
- Thanks to the Unreal Engine team for developing the native MCP plugin.
- Thanks to community users for sharing their experience with UE5.8 MCP.

## License

This project inherits the license from Deep Code CLI.

## Contact

For issues or suggestions, please contact us via:
- Submitting an Issue
- Sending a Pull Request

---

**Let AI be your Unreal Engine development partner!** 🎮✨
<p>
    <strong>
        【虚幻5.8 MCP AI 智能体！一键奴役AI帮你做游戏~】
        <a href="https://www.bilibili.com/video/BV1527y6hE4C?vd_source=d3c08f79204198e082c5943e2e1f07d1" target="_blank">
            点击观看 Bilibili 演示视频
        </a>
    </strong>
</p>
