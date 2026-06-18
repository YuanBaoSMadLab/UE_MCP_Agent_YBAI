#!/usr/bin/env node
import { fetch } from "undici";
let sid = null;
async function req(m, p = {}, t = 15000) {
  const id = Math.floor(Math.random() * 90000) + 10000;
  const c = new AbortController(); setTimeout(() => c.abort(), t);
  try {
    const r = await fetch("http://127.0.0.1:8000/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sid ? { "Mcp-Session-Id": sid } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: m, params: p }),
      signal: c.signal,
    });
    const s = r.headers.get("Mcp-Session-Id"); if (s) sid = s;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) { const d = await r.json(); return d.result; }
    if (ct.includes("text/event-stream") && r.body) {
      const rd = r.body.getReader(); const dc = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dc.decode(value, { stream: true });
        const n = buf.replace(/\r\n/g, "\n").split("\n");
        buf = n.pop() || "";
        let ed = "";
        for (const l of n) {
          const t = l.trimEnd();
          if (t.startsWith("data:")) ed = t.slice(5).trim();
          else if (t === "" && ed) { rd.releaseLock(); const p = JSON.parse(ed); if (p.result?.content) return p.result; return p.result; }
        }
      }
      rd.releaseLock(); return null;
    }
    return null;
  } catch { return null; }
}

async function main() {
  await req("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1.0" } });
  
  // list toolsets
  const lr = await req("tools/call", { name: "list_toolsets", arguments: {} });
  const text = lr.content.filter(c => c.type === "text").map(c => c.text).join("\n");
  const names = text.split("\n").map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim()).filter(Boolean);
  console.log(`工具集: ${names.length}`);
  for (const n of names) {
    const clean = n.includes(".") ? n : n;
    // 过滤掉非工具集名的描述文本
    if (n.length > 60 || n.startsWith(" ") || !n.match(/^[a-zA-Z]/)) continue;
    console.log(`\n=== ${clean} ===`);
    const dr = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: clean } });
    if (!dr?.content) { console.log("  (无响应)"); continue; }
    const dt = dr.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    let tools;
    try { tools = JSON.parse(dt).tools || []; } catch { console.log(`  解析失败`); continue; }
    console.log(`  工具: ${tools.length}`);
    for (const t of tools) {
      const sn = t.name.includes(".") ? t.name.split(".").pop() : t.name;
      console.log(`    ► ${sn}`);
    }
  }
}
main().catch(e => console.error(e.message));
