#!/usr/bin/env node
import { fetch } from "undici";

let sessionId = null;

async function req(method, params = {}, timeout = 15000) {
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
    if (ct.includes("application/json")) { const d = await res.json(); return d.error ? null : d.result; }
    if (ct.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const norm = buffer.replace(/\r\n/g, "\n");
        const lines = norm.split("\n"); buffer = lines.pop() || "";
        let eventData = "";
        for (const line of lines) {
          const t = line.trimEnd();
          if (t.startsWith("data:")) eventData = t.slice(5).trim();
          else if (t === "" && eventData) {
            reader.releaseLock();
            try { const p = JSON.parse(eventData); if (p.result?.content) return p.result; if (p.error) return null; return p.result; } catch { return null; }
          }
        }
      }
      reader.releaseLock(); return null;
    }
    return null;
  } catch { return null; }
}

async function main() {
  await req("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1.0" } });

  // 读取工具集列表
  const listResult = await req("tools/call", { name: "list_toolsets", arguments: {} });
  if (!listResult?.content) { console.log("获取工具集列表失败"); return; }
  
  const listText = listResult.content.filter(c => c.type === "text").map(c => c.text).join("\n");
  const lines = listText.split("\n").filter(l => l.trim());
  const tsNames = lines.map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim()).filter(Boolean);
  
  console.log(`\n工具集总数: ${tsNames.length}\n`);
  for (const n of tsNames) console.log(`  [${n}]`);

  // 聚焦关键工具集
  const keyToolsets = tsNames.filter(n => 
    n.includes("blueprint") || n.includes("Blueprint") ||
    n.includes("Scene") || n.includes("scene") ||
    n.includes("Material") || n.includes("material") ||
    n.includes("Asset") || n.includes("asset") ||
    n.includes("Actor") || n.includes("actor") ||
    n.includes("EditorApp") ||
    n.includes("StaticMesh") || n.includes("static_mesh") ||
    n.includes("Programmatic")
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("关键工具集:");
  console.log("=".repeat(60));

  for (const name of keyToolsets) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  [${name}]`);
    console.log("=".repeat(50));
    
    const desc = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: name } });
    if (!desc?.content) { console.log("  获取失败"); continue; }
    
    const descText = desc.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    let tools;
    try { tools = JSON.parse(descText).tools || []; } catch { console.log(`  解析失败: ${descText.substring(0, 100)}`); continue; }
    
    console.log(`  工具数: ${tools.length}\n`);
    for (const t of tools) {
      const shortName = t.name.includes(".") ? t.name.split(".").pop() : t.name;
      const props = t.inputSchema?.properties || {};
      const reqd = t.inputSchema?.required || [];
      const paramStr = Object.entries(props).map(([k, v]) => `${k}:${v.type}${reqd.includes(k) ? "!" : ""}`).join(", ");
      console.log(`  ► ${shortName}`);
      if (t.description) console.log(`    ${t.description.replace(/\n/g, " ").substring(0, 150)}`);
      if (paramStr) console.log(`    参数: ${paramStr.substring(0, 120)}`);
      console.log();
    }
  }
}

main().catch(e => console.error(`\n错误: ${e.message}`));
