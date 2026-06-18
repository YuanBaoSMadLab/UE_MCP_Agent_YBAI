#!/usr/bin/env node
/**
 * UE5.8 MCP 工具暴力探测（正确SSE解析版）
 */

import { fetch } from "undici";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

let sessionId = null;

// 正确的请求方式：自动处理 JSON 和 SSE 响应
async function req(method, params = {}, timeout = 15000) {
  const id = Math.floor(Math.random() * 90000) + 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch("http://127.0.0.1:8000/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });

    // 更新 sessionId
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;

    const ct = res.headers.get("content-type") || "";

    // === JSON 响应 ===
    if (ct.includes("application/json")) {
      const data = await res.json();
      if (data.error) return { ok: false, text: `ERROR ${data.error.code}: ${data.error.message}`, raw: JSON.stringify(data) };
      if (data.result?.content) {
        const texts = data.result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
        return { ok: true, text: texts, raw: JSON.stringify(data) };
      }
      return { ok: true, text: JSON.stringify(data.result || data), raw: JSON.stringify(data) };
    }

    // === SSE 响应 ===
    if (ct.includes("text/event-stream")) {
      if (!res.body) return { ok: false, text: "无响应体", raw: "" };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 归一化换行
        const norm = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = norm.split("\n");
        buffer = lines.pop() || ""; // 留最后一个不完整行

        let eventType = "", eventData = "";
        for (const line of lines) {
          const t = line.trimEnd();
          if (t.startsWith("event:")) eventType = t.slice(6).trim();
          else if (t.startsWith("data:")) {
            const dp = t.slice(5);
            eventData = eventData ? eventData + "\n" + dp : dp;
          }
          else if (t === "" && eventData) {
            // 完整事件，解析 JSON
            reader.releaseLock();
            try {
              const parsed = JSON.parse(eventData);
              if (parsed.result?.content) {
                const texts = parsed.result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
                return { ok: true, text: texts, raw: JSON.stringify(parsed) };
              }
              if (parsed.error) return { ok: false, text: `ERROR ${parsed.error.code}: ${parsed.error.message}`, raw: JSON.stringify(parsed) };
              return { ok: true, text: JSON.stringify(parsed.result), raw: JSON.stringify(parsed) };
            } catch (e) {
              return { ok: false, text: `SSE JSON 解析失败: ${e.message}`, raw: eventData };
            }
          }
        }
      }
      reader.releaseLock();
      return { ok: false, text: "SSE 流结束未收到数据", raw: buffer };
    }

    // === 其他 ===
    return { ok: false, text: `未知 Content-Type: ${ct}`, raw: await res.text() };

  } catch (e) {
    if (e.name === "AbortError") return { ok: false, text: `超时(${timeout}ms)`, raw: "" };
    return { ok: false, text: `请求异常: ${e.message}`, raw: "" };
  } finally {
    clearTimeout(timer);
  }
}

// 带超时的 describe_toolset
async function describe(tsName) {
  const ts = Date.now();
  const r = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: tsName } }, 8000);
  const ms = Date.now() - ts;
  return { ...r, ms };
}

// 带超时的 call_tool（可以直接调顶层工具或带 toolset 调工具集工具）
async function callTool(toolName, args = {}, toolsetName = null) {
  const params = toolsetName
    ? { name: "call_tool", arguments: { toolset_name: toolsetName, tool_name: toolName, arguments: args } }
    : { name: "call_tool", arguments: { tool_name: toolName, arguments: args } };
  const ts = Date.now();
  const r = await req("tools/call", params, 8000);
  const ms = Date.now() - ts;
  return { ...r, ms };
}

async function main() {
  console.log("=".repeat(70));
  console.log("  UE5.8 MCP 暴力探测 (正确SSE解析)");
  console.log("=".repeat(70));

  // 1. 初始化
  const initRes = await req("initialize", {
    protocolVersion: "2025-11-25", capabilities: {},
    clientInfo: { name: "ue5-probe", version: "2.0" },
  });
  console.log(`\n[0] Session: ${sessionId}`);
  console.log(`    协议: ${initRes.ok ? initRes.text.substring(0, 100) : initRes.text}`);

  // 2. list_toolsets
  console.log(`\n[1] call_tool(list_toolsets)`);
  const listR = await req("tools/call", { name: "list_toolsets", arguments: {} });
  console.log(`    结果: ${listR.text.substring(0, 300)}`);
  // 提取工具集名
  const tsNames = listR.text.split("\n")
    .map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim())
    .filter(Boolean);
  console.log(`    工具集: [${tsNames.join(", ")}]`);

  // 3. 暴力探测已知工具集名（带超时，不卡死）
  console.log(`\n[2] 暴力探测工具集...`);
  const candidates = [
    // 从用户日志里看到的
    "Editor", "Blueprint", "Asset", "Level",
    "Scene", "Material", "Animation", 
    // 带命名空间的
    "ToolsetRegistry.Editor", "ToolsetRegistry.Blueprint", "ToolsetRegistry.Asset", "ToolsetRegistry.Level",
    "ToolsetRegistry.Scene", "ToolsetRegistry.Material", "ToolsetRegistry.Actor",
    "ToolsetRegistry.EditorTools", "ToolsetRegistry.SceneTools", "ToolsetRegistry.AssetTools",
    "ToolsetRegistry.BlueprintTools", "ToolsetRegistry.LevelTools", "ToolsetRegistry.MaterialTools",
    "ToolsetRegistry.AgentSkillToolset",
    // MCP 前缀
    "MCP.Editor", "MCP.Blueprint", "MCP.Asset", "MCP.Level",
    "MCP.Scene", "MCP.Material", 
    // 简短名
    "EditorTools", "SceneTools", "AssetTools", "BlueprintTools",
  ];

  // 去重 + 排除已知有的
  const unique = [...new Set(candidates)];
  
  for (const name of unique) {
    const r = await describe(name);
    const isFound = r.ok && !r.text.includes("not found") && !r.text.startsWith("ERROR");
    if (isFound) {
      try {
        const tools = JSON.parse(r.text).tools || [];
        console.log(`  ✓ [${name}] ${tools.length} 个工具, ${r.ms}ms`);
      } catch {
        console.log(`  ✓ [${name}] (有响应), ${r.ms}ms: ${r.text.substring(0, 100)}`);
      }
    } else {
      console.log(`  ✗ [${name}] ${r.text.substring(0, 80)}, ${r.ms}ms`);
    }
  }

  // 4. 测试用户说失败的那些工具名
  console.log(`\n[3] 测试 AI 失败的工具调用...`);
  const failedTools = [
    { name: "execute_python", desc: "执行Python" },
    { name: "execute_console_command", desc: "执行控制台命令" },
    { name: "execute_python_script", desc: "执行Python脚本" },
    { name: "get_blueprint", desc: "获取蓝图" },
    { name: "edit_blueprint", desc: "编辑蓝图" },
    { name: "create_level", desc: "创建关卡" },
    { name: "create_blueprint", desc: "创建蓝图" },
    { name: "create_material", desc: "创建材质" },
    { name: "list_tools", desc: "列出工具（标准MCP）" },
    { name: "get_tools", desc: "获取工具" },
  ];

  for (const t of failedTools) {
    // 不传 toolset_name，当顶层工具调
    const r = await callTool(t.name);
    console.log(`  call_tool(${t.name}): ${r.text.substring(0, 120)} [${r.ms}ms]`);
  }

  // 5. 带 AgentSkillToolset 调工具（作为对比）
  console.log(`\n[4] 正确的调用方式（带 toolset）:`);
  const skillToolTests = [
    { name: "ListSkills", args: {} },
    { name: "GetSkills", args: { skillPaths: [] } },
  ];
  for (const t of skillToolTests) {
    const r = await callTool(t.name, t.args, "ToolsetRegistry.AgentSkillToolset");
    console.log(`  call_tool(${t.name}): ${r.text.substring(0, 150)} [${r.ms}ms]`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("  探测完成");
  console.log("=".repeat(70));
}

main().catch(e => console.error(`\n严重错误: ${e.message}`));
