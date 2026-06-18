#!/usr/bin/env node
/**
 * UE5.8 MCP 手动全路径请求
 * 暴力尝试所有可能的发现方式，找出所有工具。
 */

import { fetch } from "undici";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MCP_URL = "http://127.0.0.1:8000/mcp";
let sessionId = null;
let nextId = 1;

async function req(method, params = {}) {
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const headers = { "Content-Type": "application/json" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  
  try {
    const res = await fetch(MCP_URL, { method: "POST", headers, body });
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    return { status: res.status, contentType: ct, body: text, sessionId: sessionId };
  } catch (e) {
    return { status: 0, contentType: "", body: `请求失败: ${e.message}`, sessionId };
  }
}

function logSection(title) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("  UE5.8 MCP 暴力发现 - 尝试所有路径");
  console.log(`  目标: ${MCP_URL}`);
  console.log("=".repeat(70));

  // 1. 初始化
  logSection("[1] 初始化 initialize");
  const r1 = await req("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "ue5-scanner", version: "1.0" },
  });
  console.log(`  状态: ${r1.status}`);
  console.log(`  Session: ${sessionId}`);
  try { console.log(`  结果: ${JSON.stringify(JSON.parse(r1.body).result, null, 2).substring(0, 500)}`); }
  catch { console.log(`  原始: ${r1.body.substring(0, 300)}`); }

  // 2. 标准 MCP: tools/list (看看到底返回啥)
  logSection("[2] 标准 MCP: tools/list");
  const r2 = await req("tools/list");
  console.log(`  状态: ${r2.status} | Content-Type: ${r2.contentType}`);
  try {
    const data = JSON.parse(r2.body);
    const tools = data.result?.tools || [];
    console.log(`  工具数: ${tools.length}`);
    for (const t of tools) {
      console.log(`\n  ► ${t.name}`);
      console.log(`    描述: ${t.description || "无"}`);
      if (t.inputSchema) {
        const props = t.inputSchema.properties || {};
        console.log(`    参数: ${Object.keys(props).join(", ") || "无"}`);
        for (const [k, v] of Object.entries(props)) {
          console.log(`      - ${k}: ${v.type}${v.description ? ` - ${v.description}` : ""}`);
        }
      }
    }
  } catch (e) {
    console.log(`  原始: ${r2.body.substring(0, 500)}`);
  }

  // 3. 尝试直接调 list_toolsets (不通过 call_tool)
  logSection("[3] 直接调 list_toolsets (作为 method)");
  const r3 = await req("list_toolsets");
  console.log(`  状态: ${r3.status} | ${r3.contentType}`);
  console.log(`  响应: ${r3.body.substring(0, 500)}`);

  // 4. 通过 call_tool 调 list_toolsets
  logSection("[4] call_tool(list_toolsets)");
  const r4 = await req("tools/call", { name: "list_toolsets", arguments: {} });
  console.log(`  状态: ${r4.status} | ${r4.contentType}`);
  try {
    const data = JSON.parse(r4.body);
    if (data.result?.content) {
      for (const c of data.result.content) {
        if (c.text) console.log(`  工具集列表:\n${c.text}`);
      }
    } else {
      console.log(`  结果: ${JSON.stringify(data).substring(0, 500)}`);
    }
  } catch {
    console.log(`  原始: ${r4.body.substring(0, 500)}`);
  }

  // 5. call_tool(list_toolsets) 的 SSE 版本
  logSection("[5] call_tool(list_toolsets) - SSE 原始");
  // 用 fetch 直接读流
  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 100, method: "tools/call", params: { name: "list_toolsets", arguments: {} } }),
    });
    const ct = res.headers.get("content-type") || "";
    const rawText = await res.text();
    console.log(`  Content-Type: ${ct}`);
    console.log(`  原始长度: ${rawText.length}`);
    console.log(`  内容:\n${rawText.substring(0, 2000)}`);
  } catch (e) {
    console.log(`  失败: ${e.message}`);
  }

  // 6. 通过 call_tool 调 describe_toolset
  logSection("[6] call_tool(describe_toolset)");
  // 先看 list_toolsets 返回了什么工具集名
  let toolsetNames = [];
  try {
    const tsRes = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 200, method: "tools/call", params: { name: "list_toolsets", arguments: {} } }),
    });
    const tsText = await tsRes.text();
    // 从 SSE 或 JSON 中提取
    try {
      const j = JSON.parse(tsText);
      const text = j.result?.content?.filter(c => c.type === "text").map(c => c.text).join("") || "";
      toolsetNames = text.split("\n").map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim()).filter(Boolean);
    } catch {
      // 可能是 SSE
      const matches = tsText.match(/"text"\s*:\s*"([^"]+)"/);
      if (matches) {
        const text = matches[1].replace(/\\n/g, "\n");
        toolsetNames = text.split("\n").map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim()).filter(Boolean);
      }
    }
  } catch {}

  console.log(`  发现的工具集名: ${toolsetNames.join(", ") || "无"}`);

  for (const tsName of toolsetNames) {
    console.log(`\n  --- describe_toolset(${tsName}) ---`);
    const r6 = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: tsName } });
    try {
      const data = JSON.parse(r6.body);
      if (data.result?.content) {
        for (const c of data.result.content) {
          if (c.text) {
            // 尝试 JSON 解析
            try {
              const tools = JSON.parse(c.text).tools || [];
              console.log(`  工具数: ${tools.length}`);
              for (const t of tools) {
                console.log(`\n    ► ${t.name}`);
                console.log(`      描述: ${(t.description || "").substring(0, 100)}`);
                if (t.inputSchema) {
                  const props = t.inputSchema.properties || {};
                  for (const [k, v] of Object.entries(props)) {
                    console.log(`      ${k}: ${v.type}${v.description ? ` - ${v.description.substring(0, 60)}` : ""}`);
                  }
                }
              }
            } catch {
              console.log(`  原始文本:\n${c.text.substring(0, 800)}`);
            }
          }
        }
      }
    } catch {}
  }

  // 7. 尝试标准 MCP endpoints
  logSection("[7] 额外 endpoint 探测");
  const endpoints = [
    ["prompts/list", {}],
    ["resources/list", {}],
    ["tools/list", { all: true }],
    ["ping", {}],
    ["health", {}],
    ["status", {}],
  ];
  for (const [ep, params] of endpoints) {
    const r = await req(ep, params);
    const ok = r.status === 200 && !r.body.includes("unknown method") && !r.body.includes("not found");
    console.log(`  ${ok ? "✓" : "✗"} ${ep}: ${r.status} ${ok ? "OK" : "不支持"}`);
  }

  // 汇总
  logSection("汇总");
  console.log(`  Session: ${sessionId}`);
  console.log(`  工具集: ${toolsetNames.join(", ") || "无"}`);
  console.log(`  MCP URL: ${MCP_URL}`);
  console.log("\n  UE5 是否在运行？请检查编辑器窗口。");
  console.log("  项目是否有其他 MCP 插件启用？检查 Edit → Plugins → ModelContextProtocol");

  // 保存原始数据
  const outPath = join(dirname(fileURLToPath(import.meta.url)), "ue5-mcp-raw-scan.json");
  writeFileSync(outPath, `会话: ${sessionId}\n工具集: ${JSON.stringify(toolsetNames)}\n原始响应见上`, "utf-8");
  console.log(`\n  日志已保存到: ${outPath}`);
}

main().catch(e => console.error(`\n错误: ${e.message}`));
