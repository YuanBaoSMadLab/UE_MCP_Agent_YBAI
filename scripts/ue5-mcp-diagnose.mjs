#!/usr/bin/env node
/**
 * UE5.8 MCP 工具发现诊断脚本
 * 模拟 AI agent 的发现流程，输出每一步的原始数据，分析问题所在。
 */

import { fetch } from "undici";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MCP_URL = "http://127.0.0.1:8000/mcp";
let nextId = 1;
let sessionId = null;

async function sendRequest(method, params = {}, timeoutMs = 10000) {
  const id = nextId++;
  const request = { jsonrpc: "2.0", id, method, params };
  const headers = { "Content-Type": "application/json" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(MCP_URL, {
      method: "POST", headers, body: JSON.stringify(request), signal: controller.signal,
    });
    const sid = response.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return { ok: !data.error, status: response.status, contentType, body: data };
    } else if (contentType.includes("text/event-stream")) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", fullSSE = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullSSE += chunk;
        buffer += chunk;
        const normalized = buffer.replace(/\r\n/g, "\n");
        const lines = normalized.split("\n");
        buffer = lines.pop() || "";
        let eventData = "", eventType = "";
        for (const line of lines) {
          const t = line.trimEnd();
          if (t.startsWith("event:")) eventType = t.slice(6).trim();
          else if (t.startsWith("data:")) eventData = t.slice(5);
          else if (t === "" && eventData) {
            reader.releaseLock();
            const parsed = JSON.parse(eventData);
            return { ok: !parsed.error, status: response.status, contentType, body: parsed, rawSSE: fullSSE };
          }
        }
      }
      reader.releaseLock();
      return { ok: false, status: response.status, contentType, body: { error: "No SSE result" }, rawSSE: fullSSE };
    } else {
      return { ok: false, status: response.status, contentType, body: await response.text() };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function callToolFn(toolName, args = {}) {
  return sendRequest("tools/call", { name: toolName, arguments: args });
}

function extractText(result) {
  if (!result?.body?.result?.content) return "";
  return result.body.result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
}

function log(...args) { console.log(...args); }

async function main() {
  log("=".repeat(80));
  log("  UE5.8 MCP 工具发现诊断");
  log("=".repeat(80));
  log();

  const steps = [];
  let errors = [];

  // 1. 初始化
  log("[1/6] 初始化 MCP 连接...");
  const initRes = await sendRequest("initialize", {
    protocolVersion: "2025-11-25", capabilities: {},
    clientInfo: { name: "ue5-diag", version: "1.0" },
  });
  if (!initRes.ok) {
    log("  ❌ 初始化失败:", initRes.body);
    process.exit(1);
  }
  log(`  ✓ 协议: ${initRes.body.result?.protocolVersion}`);
  log(`  ✓ Session: ${sessionId}`);
  steps.push({ step: "initialize", response: initRes });
  log();

  // 2. tools/list
  log("[2/6] 标准 MCP tools/list...");
  const toolsList = await sendRequest("tools/list");
  log(`  响应状态: ${toolsList.status}, 类型: ${toolsList.contentType}`);
  log(`  工具数: ${toolsList.body?.result?.tools?.length || 0}`);
  for (const t of toolsList.body?.result?.tools || []) {
    log(`  ► ${t.name}`);
    const props = t.inputSchema?.properties || {};
    log(`    参数: ${Object.keys(props).join(", ") || "无"}`);
  }
  steps.push({ step: "tools/list", response: toolsList });
  log();

  // 3. call_tool(list_toolsets) 
  log("[3/6] call_tool(list_toolsets) - 发现工具集...");
  const tsResult = await callToolFn("list_toolsets");
  const tsText = extractText(tsResult);
  log(`  原始响应(raw):\n${tsText}`);
  log();

  // 解析工具集名
  const toolsetNames = tsText.split("\n")
    .map(l => l.trim().replace(/^-\s*/, "").split(":")[0].trim())
    .filter(Boolean);
  log(`  解析到 ${toolsetNames.length} 个工具集:`);
  for (const name of toolsetNames) log(`    [${name}]`);
  log();

  // 4. 对每个工具集 describe_toolset
  log("[4/6] describe_toolset - 获取每个工具集的工具详情...");
  const allToolDefs = [];

  for (const tsName of toolsetNames) {
    log(`  ─── ${tsName} ───`);
    const dtResult = await callToolFn("describe_toolset", { toolset_name: tsName });
    const dtText = extractText(dtResult);
    log(`  原始响应 (前500字):\n${dtText.substring(0, 500)}`);
    log();

    // 尝试解析 JSON
    let toolDefs = [];
    try {
      toolDefs = JSON.parse(dtText).tools || [];
      log(`  ✓ JSON 解析成功: ${toolDefs.length} 个工具`);
    } catch (e) {
      log(`  ❌ JSON 解析失败: ${e.message}`);
      // 尝试从文本中提取信息
      const nameMatches = dtText.match(/"name"\s*:\s*"([^"]+)"/g);
      if (nameMatches) {
        log(`  但从中提取到 ${nameMatches.length} 个 name 字段`);
        for (const m of nameMatches) log(`    ${m}`);
      }
      errors.push({ toolset: tsName, error: `JSON parse failed: ${e.message}`, raw: dtText.substring(0, 300) });
    }

    // 分析工具定义质量
    for (const tool of toolDefs) {
      const issues = [];
      if (!tool.name) issues.push("缺少 name");
      if (!tool.description) issues.push("缺少 description");
      else if (tool.description.length < 5) issues.push("description 太短");
      
      const schema = tool.inputSchema;
      if (!schema) issues.push("缺少 inputSchema");
      else if (schema.type !== "object") issues.push("inputSchema 不是 object 类型");
      else {
        const props = schema.properties || {};
        for (const [pName, pDef] of Object.entries(props)) {
          if (!pDef.type) issues.push(`参数 ${pName} 缺少 type`);
          if (!pDef.description) issues.push(`参数 ${pName} 缺少 description`);
        }
      }

      log(`  ► ${tool.name}`);
      log(`    描述: ${(tool.description || "❌ 无").substring(0, 80)}`);
      if (issues.length > 0) log(`    ⚠️ 问题: ${issues.join(", ")}`);
      else log(`    ✓ 工具定义完整`);

      // 输出参数
      const props = tool.inputSchema?.properties || {};
      for (const [pn, pd] of Object.entries(props)) {
        log(`      ${pn}: ${pd.type || "?"} ${pd.description ? "- " + pd.description.substring(0, 60) : "❌ 无描述"}`);
      }
      log();
    }
    allToolDefs.push({ toolset: tsName, tools: toolDefs });
    steps.push({ step: `describe_toolset(${tsName})`, response: dtResult });
  }

  // 5. 模拟 AI 视角看这些数据
  log("[5/6] AI 视角分析 - 这些工具能被 AI 理解吗？");
  log();
  
  let totalTools = 0;
  let totalIssues = 0;
  for (const { toolset, tools } of allToolDefs) {
    log(`  工具集: ${toolset}`);
    log(`  工具数: ${tools.length}`);
    totalTools += tools.length;
    for (const tool of tools) {
      const hasName = !!tool.name;
      const hasDesc = !!tool.description && tool.description.length > 5;
      const hasSchema = !!tool.inputSchema;
      const schemaComplete = hasSchema && tool.inputSchema.type === "object";
      
      if (!hasName || !hasDesc || !schemaComplete) {
        totalIssues++;
        log(`    ⚠️ ${tool.name || "无名工具"}: 定义不完整`);
      }
    }
  }
  
  log();
  log(`  总工具数: ${totalTools}`);
  log(`  有问题的工具定义: ${totalIssues}`);
  log(`  问题率: ${totalTools > 0 ? (totalIssues / totalTools * 100).toFixed(1) : 0}%`);
  log();

  // 6. 关键问题分析
  log("[6/6] 关键问题分析");
  log();
  
  // 问题1: 工具名太长  
  for (const { toolset, tools } of allToolDefs) {
    for (const tool of tools) {
      if (tool.name && tool.name.includes(".") && tool.name.split(".").length > 3) {
        log(`  问题 A: 工具名过长（含命名空间）`);
        log(`    工具: ${tool.name}`);
        log(`    影响: AI 可能搞混工具名，调用时传错 tool_name`);
        log(`    建议: 调用时只传简短名`);
      }
    }
  }

  // 问题2: 描述语言
  for (const { toolset, tools } of allToolDefs) {
    for (const tool of tools) {
      if (tool.description) {
        const isChinese = /[\u4e00-\u9fff]/.test(tool.description);
        log(`  问题 B: 工具描述语言不统一`);
        log(`    ${tool.name}: ${isChinese ? "中文" : "英文"}`);
        log(`    影响: 如果 AI 期望英文描述但收到中文，可能误解`);
        break;
      }
    }
    break;
  }

  // 问题3: 参数描述
  const toolsWithParamIssues = [];
  for (const { toolset, tools } of allToolDefs) {
    for (const tool of tools) {
      const props = tool.inputSchema?.properties || {};
      for (const [pn, pd] of Object.entries(props)) {
        if (!pd.description) {
          toolsWithParamIssues.push({ tool: tool.name, param: pn });
        }
      }
    }
  }
  if (toolsWithParamIssues.length > 0) {
    log(`  问题 C: 部分参数缺少描述`);
    for (const { tool, param } of toolsWithParamIssues.slice(0, 5)) {
      log(`    ${tool} > ${param}: 缺少描述`);
    }
  }

  // 问题4: 工具集 vs 顶层工具混淆
  log(`  问题 D: 工具集与顶层工具的映射关系`);
  log(`    顶层工具: list_toolsets, describe_toolset, call_tool`);
  log(`    工具集: ${toolsetNames.join(", ") || "无"}`);
  log(`    影响: AI 可能混淆，直接调 list_toolsets 作为 method 而不是通过 call_tool`);
  log(`    根源: UE5 把工具集工具和调度工具混在一起暴露`);

  log();
  log("=".repeat(80));
  log("  诊断完成");
  log("=".repeat(80));
  log();

  // 输出摘要
  log("=== 诊断总结 ===");
  log(`Session ID: ${sessionId}`);
  log(`发现的工具集: ${toolsetNames.length}`);
  log(`发现的总工具数: ${totalTools}`);
  log(`有问题的定义: ${totalIssues}`);
  log(`JSON 解析错误: ${errors.length}`);
  
  if (errors.length > 0) {
    log("\n错误详情:");
    for (const e of errors) log(`  ${e.toolset}: ${e.error}`);
  }

  // 保存原始数据
  const outputPath = join(dirname(fileURLToPath(import.meta.url)), "ue5-mcp-diagnosis.json");
  writeFileSync(outputPath, JSON.stringify({ 
    sessionId, 
    toolsetNames, 
    allToolDefs, 
    errors,
    steps: steps.map(s => ({ step: s.step, status: s.response.status, contentType: s.response.contentType }))
  }, null, 2), "utf-8");
  log(`\n诊断数据已保存: ${outputPath}`);
}

main().catch(e => {
  console.error(`错误: ${e.message}`);
  process.exit(1);
});
