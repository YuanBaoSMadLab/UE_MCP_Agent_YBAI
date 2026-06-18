#!/usr/bin/env node
/**
 * UE5.8 MCP - 全端口扫描 + 所有可能的请求方式
 */

import { fetch } from "undici";

const PORTS = [8000, 8001, 8002, 8080, 3000, 5000, 9000, 8888, 7000, 8008];
const PATHS = ["/mcp", "/", "/api", "/sse", "/v1/mcp", "/mcp/sse", "/jsonrpc"];
let sessionId = null;

async function tryRequest(port, path, method, params = {}) {
  const url = `http://127.0.0.1:${port}${path}`;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    const ok = !text.includes("unknown method") && !text.includes("not found") && res.status === 200;
    return { ok, status: res.status, ct, text: text.substring(0, 300) };
  } catch {
    return { ok: false, status: 0, ct: "", text: "连接失败" };
  }
}

async function scanPorts() {
  console.log("=".repeat(70));
  console.log("  UE5.8 MCP 端口扫描 + 路径探测");
  console.log("=".repeat(70));
  console.log("\n[1] 扫描端口...\n");

  const found = [];
  for (const port of PORTS) {
    for (const path of PATHS) {
      // 先 ping 一下看看端口是否开放
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 1000);
        const testRes = await fetch(`http://127.0.0.1:${port}${path}`, { method: "GET", signal: ctrl.signal });
        if (testRes.status < 500) {
          // 再试试 init
          const initRes = await tryRequest(port, path, "initialize", {
            protocolVersion: "2025-11-25", capabilities: {},
            clientInfo: { name: "ue5-scanner", version: "1.0" },
          });
          if (initRes.ok) {
            console.log(`  ✓ http://127.0.0.1:${port}${path} → MCP 可用`);
            found.push({ port, path, ...initRes });
          }
        }
      } catch {
        // 端口未开放，跳过
      }
    }
  }

  if (found.length === 0) {
    console.log("  ✗ 未找到其他 MCP 端点");
  }

  return found;
}

async function tryAllDiscoverMethods(port, path) {
  console.log(`\n[2] 在 http://127.0.0.1:${port}${path} 上尝试所有发现方式\n`);

  // 重新初始化
  sessionId = null;
  await tryRequest(port, path, "initialize", {
    protocolVersion: "2025-11-25", capabilities: {},
    clientInfo: { name: "ue5-deep-scan", version: "1.0" },
  });

  // 方法1: 标准 MCP tools/list
  console.log("  方法A: 标准 MCP tools/list");
  const r1 = await tryRequest(port, path, "tools/list");
  try {
    const data = JSON.parse(r1.text);
    const tools = data?.result?.tools || [];
    console.log(`    工具数: ${tools.length}`);
    for (const t of tools) console.log(`    ► ${t.name}`);
  } catch { console.log(`    原始: ${r1.text.substring(0, 200)}`); }

  // 方法2: call_tool(list_toolsets)
  console.log("\n  方法B: call_tool(list_toolsets)");
  const r2 = await tryRequest(port, path, "tools/call", { name: "list_toolsets", arguments: {} });
  // 从 SSE 中提取内容
  const match2 = r2.text.match(/"text"\s*:\s*"([^"]+)"/);
  console.log(`    ${match2 ? match2[1].replace(/\\n/g, "\n    ") : r2.text.substring(0, 200)}`);

  // 方法3: 直接调 describe_toolset（作为顶层工具）
  console.log("\n  方法C: 直接调 describe_toolset (作为标准 MCP method)");
  const r3 = await tryRequest(port, path, "describe_toolset", { toolset_name: "Editor" });
  console.log(`    ${r3.text.substring(0, 200)}`);

  // 方法4: 遍历所有可能的 method 名
  console.log("\n  方法D: 暴力尝试所有 method 名...");
  const methods = [
    "tools/list", "tools/call", "list_toolsets", "describe_toolset",
    "listTools", "describeToolset", "callTool",
    "mcp.list_toolsets", "mcp.describe_toolset", "mcp.call_tool",
    "rpc.list_toolsets", "rpc.describe_toolset",
    "execute", "execute_command", "editor.execute", "editor.exec",
    "blueprint.list", "blueprint.get", "blueprint.create",
    "asset.list", "asset.import", "asset.create",
    "level.create", "level.load", "level.save",
    "actor.spawn", "actor.find", "actor.delete",
    "scene.query", "scene.modify",
  ];
  
  const foundMethods = [];
  for (const method of methods) {
    const isTop = method.startsWith("tools/") || method === "initialize" || method === "ping";
    if (isTop) continue; // 跳过已知的
    const r = await tryRequest(port, path, method, {});
    if (r.ok && !r.text.includes("unknown method") && !r.text.includes("not found") && r.status === 200) {
      foundMethods.push(method);
      console.log(`  ✓ method: "${method}" → ${r.text.substring(0, 150)}`);
    }
  }
  if (foundMethods.length === 0) console.log("  无额外可用 method");

  // 方法5: 尝试把 describe_toolset 等作为 call_tool 的参数
  console.log("\n  方法E: call_tool 各种参数组合...");
  const combos = [
    { tool_name: "Editor", toolset_name: undefined },
    { tool_name: "describe_toolset", toolset_name: undefined, args: { toolset_name: "Editor" } },  
    { tool_name: "list_toolsets", toolset_name: undefined },
    { tool_name: "ListToolsets", toolset_name: undefined },
    { tool_name: "describeToolset", toolset_name: undefined },
    { tool_name: "execute_console_command", toolset_name: undefined, args: { command: "stat fps" } },
    { tool_name: "Editor.ListToolsets", toolset_name: undefined },
    { tool_name: "mcp_exec", toolset_name: undefined },
    { tool_name: "exec", toolset_name: undefined, args: { command: "editor.list_toolsets" } },
  ];

  for (const combo of combos) {
    const params = {
      name: "call_tool",
      arguments: {
        tool_name: combo.tool_name,
        ...(combo.toolset_name ? { toolset_name: combo.toolset_name } : {}),
        ...(combo.args ? { arguments: combo.args } : { arguments: {} }),
      },
    };
    const r = await tryRequest(port, path, "tools/call", params);
    const isWorking = r.ok && !r.text.includes("not found");
    console.log(`  ${isWorking ? "✓" : "✗"} call_tool(tool_name:${combo.tool_name}): ${r.text.substring(0, 120)}`);
  }
}

const main = async () => {
  const endpoints = await scanPorts();
  if (endpoints.length > 0) {
    for (const ep of endpoints) {
      await tryAllDiscoverMethods(ep.port, ep.path);
    }
  } else {
    console.log("\n只在 8000/mcp 上有已知的 MCP 服务，深入探测...");
    await tryAllDiscoverMethods(8000, "/mcp");
  }
  console.log("\n" + "=".repeat(70) + "\n完成");
};

main().catch(e => console.error(`错误: ${e.message}`));
