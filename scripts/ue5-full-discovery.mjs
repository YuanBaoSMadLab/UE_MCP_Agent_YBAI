#!/usr/bin/env node
/**
 * UE5.8 MCP 全面工具发现脚本 v3
 * 
 * 通过多种路径发现 UE5.8 MCP 的所有工具。
 * UE5.8 MCP 架构：
 *   - 顶层工具: list_toolsets, describe_toolset, call_tool
 *   - 工具集(toolset): 通过 list_toolsets 发现
 *   - 工具: 通过 describe_toolset 发现每个工具集内的工具
 *   - 标准 MCP 路径: tools/list 可能返回工具集内的工具
 */

import { fetch } from "undici";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MCP_URL = "http://127.0.0.1:8000/mcp";
let nextId = 1;
let sessionId = null;
const allDiscovered = {};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(method, params = {}, timeoutMs = 30000) {
  const id = nextId++;
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  const headers = { "Content-Type": "application/json" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const sid = response.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (data.error) throw new Error(`MCP Error: ${data.error.message}`);
      return data.result;
    } else if (contentType.includes("text/event-stream")) {
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = normalized.split("\n");
        buffer = lines.pop() || "";

        let eventType = "", eventData = "";
        for (const line of lines) {
          const trimmed = line.trimEnd();
          if (trimmed.startsWith("event:")) eventType = trimmed.slice(6).trim();
          else if (trimmed.startsWith("data:")) {
            const dataPart = trimmed.slice(5);
            eventData = eventData ? eventData + "\n" + dataPart : dataPart;
          } else if (trimmed === "" && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              reader.releaseLock();
              if (parsed.result) return parsed.result;
              if (parsed.error) throw new Error(`MCP Error: ${parsed.error.message}`);
              return parsed;
            } catch (e) {
              if (e.message?.startsWith("MCP Error:")) throw e;
            }
            eventType = ""; eventData = "";
          }
        }
      }
      reader.releaseLock();
      throw new Error("No result in SSE response");
    } else {
      const text = await response.text();
      throw new Error(`Unexpected content type: ${contentType}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function callTool(toolName, args = {}) {
  return await sendRequest("tools/call", { name: toolName, arguments: args });
}

function extractText(result) {
  if (!result) return "";
  const content = result.content || [];
  return content.filter(c => c.type === "text" && c.text).map(c => c.text).join("\n");
}

async function main() {
  console.log("=".repeat(90));
  console.log("  UE5.8 MCP 全面工具发现 v3");
  console.log("=".repeat(90));
  console.log();

  // 1. 初始化
  const initResult = await sendRequest("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "ue5-full-discovery", version: "3.0.0" },
  });
  console.log(`[✓] 初始化成功 | 协议: ${initResult?.protocolVersion} | Session: ${sessionId}\n`);

  // ================================================================
  // 方法 A: 标准 MCP tools/list
  // ================================================================
  console.log("━".repeat(70));
  console.log("  [方法 A] 标准 MCP tools/list (返回顶层工具)");
  console.log("━".repeat(70));
  const toolsResult = await sendRequest("tools/list");
  const topLevelTools = toolsResult?.tools || [];
  console.log(`  顶层工具数: ${topLevelTools.length}\n`);
  for (const t of topLevelTools) {
    console.log(`  ► ${t.name}`);
    if (t.description) console.log(`    ${t.description}`);
    const props = t.inputSchema?.properties || {};
    const keys = Object.keys(props);
    if (keys.length > 0) console.log(`    参数: ${keys.join(", ")}`);
    console.log();
  }
  allDiscovered.topLevelTools = topLevelTools;

  // ================================================================
  // 方法 B: 调用 list_toolsets
  // ================================================================
  console.log("━".repeat(70));
  console.log("  [方法 B] 调用 list_toolsets (发现工具集)");
  console.log("━".repeat(70));
  
  const listResult = await callTool("list_toolsets");
  const listText = extractText(listResult);
  console.log(`  原始响应:\n${listText}\n`);

  // 解析工具集
  const toolsetLines = listText.split("\n").filter(l => l.trim());
  const toolsets = toolsetLines.map(line => {
    const cleanLine = line.trim().replace(/^-\s*/, "");
    const idx = cleanLine.indexOf(":");
    if (idx > 0) return { name: cleanLine.substring(0, idx).trim(), description: cleanLine.substring(idx + 1).trim() };
    // 也可能是简单名称
    return { name: cleanLine.trim(), description: "" };
  });

  console.log(`  发现 ${toolsets.length} 个工具集:\n`);
  for (const ts of toolsets) {
    console.log(`  [${ts.name}]`);
    if (ts.description) console.log(`  描述: ${ts.description}`);
    console.log();
  }

  // ================================================================
  // 方法 C: 对每个工具集深入探索
  // ================================================================
  console.log("━".repeat(70));
  console.log("  [方法 C] 深入探索每个工具集");
  console.log("━".repeat(70));
  console.log();

  const allToolsetDetails = {};

  for (const ts of toolsets) {
    console.log(`  ─── ${ts.name} ───\n`);

    // C1: 用 describe_toolset
    try {
      const detailResult = await callTool("describe_toolset", { toolset_name: ts.name });
      const detailText = extractText(detailResult);
      console.log(`  [C1] describe_toolset 响应:\n${detailText.substring(0, 500)}\n`);

      // 尝试解析 JSON
      let toolList = [];
      try {
        const jsonData = JSON.parse(detailText);
        toolList = jsonData.tools || [];
      } catch {
        // 纯文本或 YAML
        // 提取工具名
        const lines = detailText.split("\n");
        for (const l of lines) {
          const match = l.match(/"?name"?\s*:\s*"([^"]+)"/);
          if (match) {
            const toolName = match[1];
            // 查找对应的 description
            const descMatch = detailText.match(new RegExp(`"${toolName}"[\\s\\S]*?"description"\\s*:\\s*"([^"]+)"`));
            console.log(`    发现工具: ${toolName}${descMatch ? ` - ${descMatch[1].substring(0, 80)}` : ""}`);
          }
        }
        console.log();
      }

      if (toolList.length > 0) {
        console.log(`  → 解析到 ${toolList.length} 个工具:\n`);
        for (const tool of toolList) {
          console.log(`  ► ${tool.name}`);
          if (tool.description) console.log(`    描述: ${tool.description}`);
          if (tool.inputSchema) {
            const props = tool.inputSchema.properties || {};
            const required = tool.inputSchema.required || [];
            for (const [pName, pDef] of Object.entries(props)) {
              const isReq = required.includes(pName);
              console.log(`    ${isReq ? "  !" : "   "} ${pName}: ${pDef?.type || "any"}${pDef?.description ? ` - ${pDef.description}` : ""}`);
            }
          }
          console.log();
        }
        allToolsetDetails[ts.name] = toolList;
      }
    } catch (e) {
      console.log(`  [C1] 失败: ${e.message}\n`);
    }

    // C2: 尝试通过 tools/list 获取（带参数）
    try {
      const r2 = await sendRequest("tools/list", { toolset_name: ts.name });
      if (r2?.tools?.length > 0) {
        console.log(`  [C2] tools/list(toolset_name=${ts.name}) → ${r2.tools.length} 个工具\n`);
        for (const t of r2.tools) {
          console.log(`  ► ${t.name}: ${(t.description || "").substring(0, 100)}`);
        }
        console.log();
        if (!allToolsetDetails[ts.name]) allToolsetDetails[ts.name] = [];
        allToolsetDetails[ts.name].push(...r2.tools);
      }
    } catch (e) {
      // 忽略
    }

    await sleep(200);
  }

  // ================================================================
  // 方法 D: 尝试通过 tools/list 发现其他路径
  // ================================================================
  console.log("━".repeat(70));
  console.log("  [方法 D] 其他 MCP 端点探测");
  console.log("━".repeat(70));
  console.log();

  const extraEndpoints = [
    "prompts/list",
    "resources/list",
    "tools/list?all=true",
  ];

  for (const ep of extraEndpoints) {
    try {
      const [method, ...qp] = ep.split("?");
      const params = qp.length > 0 ? Object.fromEntries(qp.map(p => p.split("=").map(decodeURIComponent))) : {};
      const result = await sendRequest(method, params);
      console.log(`  [D] ${ep}: ${JSON.stringify(result).substring(0, 300)}`);
      console.log();
    } catch (e) {
      console.log(`  [D] ${ep}: ${e.message}`);
      console.log();
    }
  }

  // ================================================================
  // 汇总
  // ================================================================
  console.log("━".repeat(70));
  console.log("  汇总");
  console.log("━".repeat(70));
  console.log();

  // 把所有发现汇聚
  const allTools = [];
  
  // 顶层工具
  for (const t of topLevelTools) {
    allTools.push({ toolset: "__top__", ...t });
  }

  // 工具集内工具
  for (const [tsName, tools] of Object.entries(allToolsetDetails)) {
    for (const t of tools) {
      allTools.push({ toolset: tsName, ...t });
    }
  }

  console.log(`  工具总数: ${allTools.length}`);
  console.log(`  工具集数: ${toolsets.length}`);
  console.log();

  // 输出完整清单
  const fullInventory = {
    discoveredAt: new Date().toISOString(),
    server: {
      protocol: initResult?.protocolVersion,
      sessionId,
    },
    topLevelTools: topLevelTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    toolsets: Object.fromEntries(
      Object.entries(allToolsetDetails).map(([name, tools]) => [
        name,
        tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      ])
    ),
    allTools,
  };

  // 保存
  const outputPath = join(dirname(fileURLToPath(import.meta.url)), "ue5-full-inventory.json");
  writeFileSync(outputPath, JSON.stringify(fullInventory, null, 2), "utf-8");
  
  console.log("  完整清单已保存到: " + outputPath);
  console.log();
  console.log("=".repeat(90));
  console.log("  发现完成！");
  console.log("=".repeat(90));
}

main().catch(e => {
  console.error(`\n错误: ${e.message}`);
  process.exit(1);
});
