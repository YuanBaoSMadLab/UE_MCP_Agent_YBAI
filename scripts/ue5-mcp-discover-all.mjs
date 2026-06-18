#!/usr/bin/env node
/**
 * 探测新发现的工具集详情
 */
import { fetch } from "undici";

let sessionId = null;

async function req(method, params = {}, timeout = 10000) {
  const id = Math.floor(Math.random() * 90000) + 10000;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch("http://127.0.0.1:8000/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });
    const sid = res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      const d = await res.json();
      return d.error ? `ERROR: ${d.error.message}` : JSON.stringify(d.result || d);
    }
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
            const p = JSON.parse(eventData);
            if (p.result?.content) return p.result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
            return p.error ? `ERROR: ${p.error.message}` : JSON.stringify(p.result);
          }
        }
      }
      reader.releaseLock();
      return "SSE 流结束";
    }
    return `未知类型: ${ct}`;
  } catch (e) {
    return `失败: ${e.message}`;
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("  新工具集详情探测");
  console.log("=".repeat(70));

  // 初始化
  await req("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "ue5-probe", version: "3.0" } });
  console.log(`\nSession: ${sessionId}\n`);

  // 获取工具集列表
  const listText = await req("tools/call", { name: "list_toolsets", arguments: {} });
  const tsNames = listText.split("\n").map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim()).filter(Boolean);
  console.log(`工具集数: ${tsNames.length}\n`);

  // 对每个工具集 describe
  for (const name of tsNames) {
    console.log(`\n${"─".repeat(50)}\n[${name}]`);
    const descText = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: name } });
    
    try {
      const data = JSON.parse(descText);
      const tools = data.tools || [];
      console.log(`  工具数: ${tools.length}`);
      for (const t of tools) {
        const shortName = t.name.includes(".") ? t.name.split(".").pop() : t.name;
        const props = t.inputSchema?.properties || {};
        const paramCount = Object.keys(props).length;
        console.log(`  ► ${shortName} ${paramCount > 0 ? `(${paramCount} 参数)` : "(无参数)"}`);
        if (t.description && t.description.length > 10) {
          console.log(`    ${t.description.substring(0, 120)}`);
        }
      }
    } catch {
      console.log(`  原始: ${descText.substring(0, 300)}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("完成");
}

main().catch(e => console.error(`\n错误: ${e.message}`));
