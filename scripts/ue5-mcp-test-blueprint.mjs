#!/usr/bin/env node
import { fetch } from "undici";
let sid = null;
async function req(m, p = {}) {
  const id = Math.floor(Math.random() * 90000) + 10000;
  const c = new AbortController(); setTimeout(() => c.abort(), 15000);
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
      const { done, value } = await rd.read(); if (done) break;
      buf += dc.decode(value, { stream: true });
      const n = buf.replace(/\r\n/g, "\n").split("\n"); buf = n.pop() || "";
      let ed = "";
      for (const l of n) {
        const t = l.trimEnd();
        if (t.startsWith("data:")) ed = t.slice(5).trim();
        else if (t === "" && ed) { rd.releaseLock(); const p = JSON.parse(ed); return p.result; }
      }
    }
    rd.releaseLock(); return null;
  }
  return null;
}

async function main() {
  await req("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1.0" } });
  console.log("Session:", sid);

  // 1. 先检查 BlueprintTools
  console.log("\n=== BlueprintTools ===");
  const dr = await req("tools/call", { name: "describe_toolset", arguments: { toolset_name: "editor_toolset.toolsets.blueprint.BlueprintTools" } });
  if (dr?.content) {
    const dt = dr.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    try {
      const tools = JSON.parse(dt).tools || [];
      console.log(`  工具数: ${tools.length}\n`);
      for (const t of tools) {
        const sn = t.name.includes(".") ? t.name.split(".").pop() : t.name;
        const props = t.inputSchema?.properties || {};
        console.log(`  ► ${sn}  (${Object.keys(props).length} 参数)`);
      }
    } catch { console.log(`  解析失败: ${dt.substring(0, 200)}`); }
  }

  // 2. 测试几个关键调用
  console.log("\n=== 调用测试 ===");

  // 场景工具
  console.log("\n▶ SceneTools - get_current_level:");
  const r1 = await req("tools/call", { name: "call_tool", arguments: { toolset_name: "editor_toolset.toolsets.scene.SceneTools", tool_name: "get_current_level", arguments: {} } });
  const t1 = r1?.content?.filter(c => c.type === "text").map(c => c.text).join("") || "无响应";
  console.log(`  ${t1.substring(0, 200)}`);

  // 静态网格
  console.log("\n▶ StaticMeshTools - get_lod_count (on BP_TripleJump):");
  const r2 = await req("tools/call", { name: "call_tool", arguments: { toolset_name: "editor_toolset.toolsets.static_mesh.StaticMeshTools", tool_name: "get_lod_count", arguments: { mesh: "/Game/BP_TripleJump.BP_TripleJump_C" } } });
  const t2 = r2?.content?.filter(c => c.type === "text").map(c => c.text).join("") || "无响应";
  console.log(`  ${t2.substring(0, 200)}`);

  // AssetTools
  console.log("\n▶ AssetTools - find_assets:");
  const r3 = await req("tools/call", { name: "call_tool", arguments: { toolset_name: "editor_toolset.toolsets.asset.AssetTools", tool_name: "find_assets", arguments: { search_text: "BP_", types: [] } } });
  const t3 = r3?.content?.filter(c => c.type === "text").map(c => c.text).join("") || "无响应";
  console.log(`  ${t3.substring(0, 200)}`);

  console.log("\n✅ 测试完成");
}
main().catch(e => console.error(e.message));
