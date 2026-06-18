#!/usr/bin/env node
/**
 * UE5.8 MCP 工具发现脚本 v2
 * 
 * 连接 UE5.8 MCP 服务器，获取所有工具集（toolsets）和工具信息。
 * UE5.8 把 list_toolsets/describe_toolset 暴露为标准 MCP tool，
 * 需要用 tools/call 来调用。
 */

import { fetch } from "undici";

const MCP_URL = "http://127.0.0.1:8000/mcp";
let nextId = 1;
let sessionId = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(method, params = {}) {
  const id = nextId++;
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }

  const response = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
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

      let eventType = "";
      let eventData = "";

      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed.startsWith("event:")) {
          eventType = trimmed.slice(6).trim();
        } else if (trimmed.startsWith("data:")) {
          const dataPart = trimmed.slice(5);
          eventData = eventData ? eventData + "\n" + dataPart : dataPart;
        } else if (trimmed === "" && eventData) {
          try {
            if (eventType === "message" || !eventType) {
              const parsed = JSON.parse(eventData);
              reader.releaseLock();
              if (parsed.result) return parsed.result;
              if (parsed.error) throw new Error(`MCP Error: ${parsed.error.message}`);
              return parsed;
            }
          } catch (e) {
            if (e.message && e.message.startsWith("MCP Error:")) throw e;
          }
          eventType = "";
          eventData = "";
        }
      }
    }
    reader.releaseLock();
    throw new Error("No result in SSE response");
  } else {
    const text = await response.text();
    throw new Error(`Unexpected content type: ${contentType}, body: ${text.substring(0, 200)}`);
  }
}

async function callTool(toolName, args = {}) {
  return await sendRequest("tools/call", {
    name: toolName,
    arguments: args,
  });
}

function extractText(result) {
  if (!result) return "";
  const content = result.content || [];
  return content
    .filter(c => c.type === "text" && c.text)
    .map(c => c.text)
    .join("\n");
}

function tryParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

async function main() {
  console.log("=".repeat(90));
  console.log("  UE5.8 MCP 完整工具发现 (v2)");
  console.log("=".repeat(90));
  console.log();

  try {
    // 1. 初始化
    const initResult = await sendRequest("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "ue5-discovery", version: "2.0.0" },
    });
    console.log(`[1] 初始化成功`);
    console.log(`    协议版本: ${initResult?.protocolVersion || "N/A"}`);
    console.log(`    Session ID: ${sessionId}`);
    console.log();

    // 2. 列出所有标准 tools
    console.log("[2] 获取 tools/list...");
    const toolsResult = await sendRequest("tools/list");
    const tools = toolsResult?.tools || [];
    console.log(`    共 ${tools.length} 个顶层工具:\n`);
    for (const t of tools) {
      console.log(`    ► ${t.name}`);
      if (t.description) console.log(`      ${t.description}`);
      const schema = t.inputSchema?.properties || {};
      const schemaKeys = Object.keys(schema);
      if (schemaKeys.length > 0) {
        console.log(`      参数: ${schemaKeys.join(", ")}`);
      }
      console.log();
    }
    console.log();

    // 3. 调用 list_toolsets 工具
    console.log("[3] 调用 list_toolsets...");
    const listResult = await callTool("list_toolsets");
    const listText = extractText(listResult);
    console.log(`    响应:\n${listText}`);
    console.log();

    // 解析 UE5 的响应格式 (每行 - toolsetName: description)
    const toolsetLines = listText.split("\n").filter(l => l.trim());
    const toolsets = toolsetLines.map(line => {
      // 去掉行首的 "- " 前缀
      const cleanLine = line.trim().replace(/^-\s*/, "");
      const idx = cleanLine.indexOf(":");
      if (idx > 0) {
        return {
          name: cleanLine.substring(0, idx).trim(),
          description: cleanLine.substring(idx + 1).trim(),
        };
      }
      return null;
    }).filter(Boolean);

    console.log(`    解析到 ${toolsets.length} 个工具集:\n`);
    for (const ts of toolsets) {
      console.log(`  [${ts.name}]`);
      console.log(`    描述: ${ts.description || "无"}`);
      console.log();
    }

    // 4. 获取每个工具集的详细信息
    console.log("=".repeat(90));
    console.log("[4] 获取每个工具集详情 (describe_toolset):");
    console.log("=".repeat(90));
    console.log();

    const allToolInfo = {};

    for (const ts of toolsets) {
      console.log(`${"─".repeat(50)} ${ts.name} ${"─".repeat(50)}`);
      console.log(`  描述: ${ts.description || "无"}`);
      console.log();
      
      try {
        const detailResult = await callTool("describe_toolset", { toolset_name: ts.name });
        const detailText = extractText(detailResult);
        console.log(`    原始详情:\n${detailText.substring(0, 300)}`);
        console.log();

        // 尝试解析 JSON
        let toolDefs = [];
        const jsonData = tryParseJSON(detailText);
        if (jsonData) {
          toolDefs = jsonData.tools || [];
        } else {
          // 可能是 YAML/text 格式
          // 尝试从文本中提取工具名
          const toolMatches = detailText.matchAll(/-?\s*(\w+):\s*(.*)/g);
          for (const m of toolMatches) {
            if (m[1] && !m[1].startsWith("type") && !m[1].startsWith("required")) {
              // 简单的工具名提取
            }
          }
        }

        console.log(`  工具数: ${toolDefs.length}\n`);

        allToolInfo[ts.name] = {
          description: ts.description,
          tools: toolDefs,
        };

        for (const tool of toolDefs) {
          console.log(`  ► ${tool.name}`);
          if (tool.description) console.log(`    描述: ${tool.description}`);
          if (tool.inputSchema) {
            const props = tool.inputSchema.properties || {};
            const required = tool.inputSchema.required || [];
            const propEntries = Object.entries(props);
            if (propEntries.length > 0) {
              console.log(`    参数:`);
              for (const [pName, pDef] of propEntries) {
                const isReq = required.includes(pName);
                const typeInfo = pDef?.type || "any";
                const desc = pDef?.description || "";
                console.log(`      - ${pName}${isReq ? " (必填)" : ""} [${typeInfo}]: ${desc}`);
              }
            } else {
              console.log(`    参数: 无`);
            }
          }
          console.log();
        }
      } catch (e) {
        console.log(`  获取失败: ${e.message}\n`);
      }

      await sleep(100);
    }

    // 5. 生成完整工具清单到文件
    console.log("=".repeat(90));
    console.log("[5] 生成完整工具清单...");
    console.log("=".repeat(90));
    console.log();

    const fullInventory = {
      server: {
        protocol: initResult?.protocolVersion || "N/A",
        sessionId,
      },
      topLevelTools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      toolsets: allToolInfo,
    };

    console.log(JSON.stringify(fullInventory, null, 2));
    console.log();
    
    // 写入文件
    const { writeFileSync } = await import("fs");
    const { join, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const outputPath = join(dirname(fileURLToPath(import.meta.url)), "ue5-mcp-inventory.json");
    writeFileSync(outputPath, JSON.stringify(fullInventory, null, 2), "utf-8");
    console.log(`  清单已保存到: ${outputPath}`);
    console.log();
    console.log("=".repeat(90));
    console.log("  发现完成！");
    console.log("=".repeat(90));

  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`);
    console.error("\n请确保 UE5.8 编辑器已启动，并且 MCP 插件运行在端口 8000。");
    process.exit(1);
  }
}

main();
