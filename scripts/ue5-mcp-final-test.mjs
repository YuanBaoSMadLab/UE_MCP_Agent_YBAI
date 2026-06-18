#!/usr/bin/env node
/**
 * 最终验证 v2 - 正确解析 SSE
 */
import { fetch } from "undici";

const URL = "http://127.0.0.1:8000/mcp";
let sessionId = null;
let nextId = 1;

// 正确的请求方式：自动处理 JSON 和 SSE
async function req(method, params = {}, timeout = 10000) {
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const headers = { "Content-Type": "application/json" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(URL, { method: "POST", headers, body, signal: controller.signal });
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;
    const ct = res.headers.get("content-type") || "";

    // JSON
    if (ct.includes("application/json")) {
      const data = await res.json();
      if (data.error) return { ok: false, text: `ERROR: ${data.error.message}` };
      return { ok: true, text: JSON.stringify(data.result || data), json: true };
    }

    // SSE
    if (ct.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const norm = buffer.replace(/\r\n/g, "\n");
        const lines = norm.split("\n");
        buffer = lines.pop() || "";
        let eventData = "";
        for (const line of lines) {
          const t = line.trimEnd();
          if (t.startsWith("data:")) eventData = t.slice(5).trim();
          else if (t === "" && eventData) {
            reader.releaseLock();
            try {
              const parsed = JSON.parse(eventData);
              if (parsed.result?.content) {
                const texts = parsed.result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
                return { ok: true, text: texts };
              }
              if (parsed.error) return { ok: false, text: `ERROR: ${parsed.error.message}` };
              return { ok: true, text: JSON.stringify(parsed.result) };
            } catch (e) {
              return { ok: false, text: `SSE解析失败: ${e.message}` };
            }
          }
        }
      }
      reader.releaseLock();
      return { ok: false, text: "SSE 流结束无数据" };
    }
    return { ok: false, text: `未知类型: ${ct}` };
  } catch (e) {
    if (e.name === "AbortError") return { ok: false, text: `超时(${timeout}ms)` };
    return { ok: false, text: `失败: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("  UE5.8 MCP 新版 API 最终验证 v2");
  console.log("=".repeat(60));

  // 1. 初始化
  console.log("\n[1] 初始化...");
  const r1 = await req("initialize", {
    protocolVersion: "2025-11-25", capabilities: {},
    clientInfo: { name: "yb-ai", version: "1.0" },
  });
  console.log(`  ✓ Session: ${sessionId}`);

  // 2. tools/list
  console.log("\n[2] tools/list...");
  const r2 = await req("tools/list");
  const tools = r2.ok ? JSON.parse(r2.text).tools || JSON.parse(r2.text) : [];
  const toolCount = Array.isArray(tools) ? tools.length : 0;
  console.log(`  ✓ ${toolCount} 个工具`);
  if (Array.isArray(tools)) for (const t of tools) console.log(`  ► ${t.name}`);

  // 3. call_tool(list_toolsets)
  console.log("\n[3] call_tool(list_toolsets)...");
  const r3 = await req("tools/call", { name: "list_toolsets", arguments: {} });
  console.log(`  ${r3.ok ? "✓" : "✗"} ${r3.text.substring(0, 200)}`);

  // 4. describe_toolset(AgentSkillToolset)
  console.log("\n[4] describe_toolset(AgentSkillToolset)...");
  const r4 = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: "ToolsetRegistry.AgentSkillToolset" } });
  if (r4.ok) {
    try {
      const defs = JSON.parse(r4.text).tools || [];
      console.log(`  ✓ ${defs.length} 个工具`);
      for (const t of defs) console.log(`  ► ${t.name}`);
    } catch {
      console.log(`  ${r4.text.substring(0, 200)}`);
    }
  } else console.log(`  ✗ ${r4.text}`);

  // 5. call_tool → ListSkills
  console.log("\n[5] call_tool(ListSkills)...");
  const r5 = await req("tools/call", {
    name: "call_tool",
    arguments: { toolset_name: "ToolsetRegistry.AgentSkillToolset", tool_name: "ListSkills", arguments: {} },
  });
  console.log(`  ${r5.ok ? "✓" : "✗"} ${r5.text.substring(0, 200)}`);

  // 总结
  console.log("\n" + "=".repeat(60));
  const allOk = r1.ok && r2.ok && r3.ok && r4.ok && r5.ok;
  console.log(`  ${allOk ? "✓ 全部通过！新版 API 工作正常" : "✗ 部分失败"}`);
  console.log("=".repeat(60));
}

main().catch(e => console.error(`\n错误: ${e.message}`));
