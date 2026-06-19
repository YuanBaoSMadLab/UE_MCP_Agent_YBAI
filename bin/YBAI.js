#!/usr/bin/env node
// YBAI - UE MCP Agent YBAI 启动器
// npm install -g 后，在 cmd 中输入 YBAI 即可启动 YB-AI-Manager.exe

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 查找 YB-AI-Manager.exe（相对于 npm 全局安装目录）
const exePath = join(__dirname, "..", "YB-AI-Manager.exe");

try {
  const child = spawn(exePath, [], {
    stdio: "inherit",
    windowsHide: false,
    shell: false,
  });

  child.on("error", (err) => {
    console.error(`[YBAI] 启动失败: ${err.message}`);
    console.error(`[YBAI] 请确保 YB-AI-Manager.exe 位于: ${exePath}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} catch (err) {
  console.error(`[YBAI] 启动异常: ${err}`);
  process.exit(1);
}
