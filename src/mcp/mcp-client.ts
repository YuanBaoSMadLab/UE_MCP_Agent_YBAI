import { spawn, type ChildProcess } from "child_process";
import { createInterface, type Interface } from "readline";
import * as path from "path";
import { killProcessTree } from "../common/process-tree";
import { logMessage } from "../common/debug-logger";
import { fetch } from "undici";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

type ListToolsResult = {
  tools: McpToolDefinition[];
  nextCursor?: string;
};

type CallToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

export type McpPromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type McpPromptDefinition = {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
};

type ListPromptsResult = {
  prompts: McpPromptDefinition[];
  nextCursor?: string;
};

export type McpPromptMessage = {
  role: "user" | "assistant";
  content: { type: string; text?: string };
};

type GetPromptResult = {
  description?: string;
  messages: McpPromptMessage[];
};

export type McpResourceDefinition = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};

type ListResourcesResult = {
  resources: McpResourceDefinition[];
  nextCursor?: string;
};

export type McpResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

type ReadResourceResult = {
  contents: McpResourceContent[];
};

export type McpNotificationHandler = (method: string, params?: Record<string, unknown>) => void;

export type McpSpawnSpec = {
  command: string;
  args: string[];
  shell: boolean;
  windowsHide?: boolean;
};

export class McpClient {
  private process: ChildProcess | null = null;
  private reader: Interface | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private stderrBuffer = "";
  private notificationHandler: McpNotificationHandler | null = null;
  private disconnectHandler: ((reason: string) => void) | null = null;
  private intentionallyDisconnected = false;

  constructor(
    private readonly serverName: string,
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env?: Record<string, string>,
    onNotification?: McpNotificationHandler,
    onDisconnect?: (reason: string) => void
  ) {
    this.notificationHandler = onNotification ?? null;
    this.disconnectHandler = onDisconnect ?? null;
  }

  async connect(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionallyDisconnected = false;
      const childEnv = {
        ...process.env,
        ...this.env,
      };
      const args = this.withNpxYesArg(this.command, this.args);
      const spawnSpec = createMcpSpawnSpec(this.command, args);

      this.process = spawn(spawnSpec.command, spawnSpec.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnv,
        shell: spawnSpec.shell,
        windowsHide: spawnSpec.windowsHide,
      });

      let resolved = false;
      const safeReject = (err: Error) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      };

      this.process.on("error", (err) => {
        safeReject(
          this.withStderr(`Failed to start MCP server "${this.serverName}" (${this.command}): ${err.message}`)
        );
      });

      this.process.on("close", (code) => {
        const reason = `MCP server "${this.serverName}" exited with code ${code}`;
        const error = this.withStderr(reason);
        for (const [, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pendingRequests.clear();
        this.reader?.close();
        this.reader = null;
        this.process = null;
        if (!this.intentionallyDisconnected && this.disconnectHandler) {
          this.disconnectHandler(reason);
        }
        safeReject(error);
      });

      if (this.process.stderr) {
        this.process.stderr.on("data", (data: Buffer) => {
          this.appendStderr(data.toString("utf8"));
        });
      }

      this.reader = createInterface({ input: this.process.stdout! });
      this.reader.on("line", (line: string) => {
        this.handleLine(line);
      });

      // Send initialize request (MCP protocol handshake)
      this.sendRequest(
        "initialize",
        {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "ue-mcp-agent-ybai", version: "1.0.0" },
        },
        timeoutMs
      )
        .then((result) => {
          // Validate protocol version from server response (per MCP spec §4.2.1.2)
          const initResult = result as { protocolVersion?: string } | undefined;
          const serverVersion = initResult?.protocolVersion;
          if (
            serverVersion &&
            serverVersion !== "2025-11-25" &&
            serverVersion !== "2025-03-26" &&
            serverVersion !== "2024-11-05"
          ) {
            reject(
              new Error(
                `Unsupported MCP protocol version "${serverVersion}" from server "${this.serverName}". ` +
                  `Client supports 2025-11-25, 2025-03-26 and 2024-11-05.`
              )
            );
            return;
          }
          // Send initialized notification
          this.sendNotification("notifications/initialized");
          resolve();
        })
        .catch(reject);
    });
  }

  async listTools(timeoutMs: number): Promise<McpToolDefinition[]> {
    const tools: McpToolDefinition[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 100; page++) {
      const params = cursor ? { cursor } : {};
      const result = (await this.sendRequest("tools/list", params, timeoutMs)) as ListToolsResult;
      tools.push(...(result.tools ?? []));
      cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
      if (!cursor) {
        return tools;
      }
    }

    throw this.withStderr(`MCP server "${this.serverName}" returned too many tools/list pages`);
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 60_000): Promise<CallToolResult> {
    return (await this.sendRequest("tools/call", { name, arguments: args }, timeoutMs)) as CallToolResult;
  }

  async listPrompts(timeoutMs: number): Promise<McpPromptDefinition[]> {
    try {
      const prompts: McpPromptDefinition[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 100; page++) {
        const params = cursor ? { cursor } : {};
        const result = (await this.sendRequest("prompts/list", params, timeoutMs)) as ListPromptsResult;
        prompts.push(...(result.prompts ?? []));
        cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
        if (!cursor) {
          return prompts;
        }
      }

      throw this.withStderr(`MCP server "${this.serverName}" returned too many prompts/list pages`);
    } catch (_error) {
      // If the server doesn't support prompts/list, return empty array
      return [];
    }
  }

  async getPrompt(name: string, args: Record<string, unknown>, timeoutMs = 30_000): Promise<GetPromptResult> {
    return (await this.sendRequest("prompts/get", { name, arguments: args }, timeoutMs)) as GetPromptResult;
  }

  async listResources(timeoutMs: number): Promise<McpResourceDefinition[]> {
    try {
      const resources: McpResourceDefinition[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 100; page++) {
        const params = cursor ? { cursor } : {};
        const result = (await this.sendRequest("resources/list", params, timeoutMs)) as ListResourcesResult;
        resources.push(...(result.resources ?? []));
        cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
        if (!cursor) {
          return resources;
        }
      }

      throw this.withStderr(`MCP server "${this.serverName}" returned too many resources/list pages`);
    } catch (_error) {
      // If the server doesn't support resources/list, return empty array
      return [];
    }
  }

  async readResource(uri: string, timeoutMs = 30_000): Promise<ReadResourceResult> {
    return (await this.sendRequest("resources/read", { uri }, timeoutMs)) as ReadResourceResult;
  }

  disconnect(): void {
    this.intentionallyDisconnected = true;
    if (this.reader) {
      this.reader.close();
      this.reader = null;
    }
    if (this.process) {
      if (typeof this.process.pid === "number") {
        killProcessTree(this.process.pid, "SIGTERM", { killGroupOnNonWindows: false });
      } else {
        this.process.kill();
      }
      this.process = null;
    }
  }

  isConnected(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  private sendRequest(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          this.withStderr(
            `Timed out after ${timeoutMs}ms waiting for MCP server "${this.serverName}" to respond to ${method}`
          )
        );
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.writeLine(JSON.stringify(request));
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification = {
      jsonrpc: "2.0" as const,
      method,
      params,
    };
    this.writeLine(JSON.stringify(notification));
  }

  private writeLine(data: string): void {
    if (this.process?.stdin) {
      this.process.stdin.write(data + "\n");
    }
  }

  private handleLine(line: string): void {
    try {
      const parsed: unknown = JSON.parse(line);

      // Handle JSON-RPC batch (array of requests/notifications/responses)
      // Per MCP 2025-03-26 §4.1.1.3: implementations MUST support receiving batches.
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") {
            this.handleSingleMessage(item);
          }
        }
        return;
      }

      // Handle single message
      if (parsed && typeof parsed === "object") {
        this.handleSingleMessage(parsed);
      }
    } catch {
      // Ignore unparseable lines
    }
  }

  private handleSingleMessage(msg: object): void {
    // Handle notifications (no id field — server-initiated)
    if (!("id" in msg)) {
      const notification = msg as unknown as JsonRpcNotification;
      if (this.notificationHandler && typeof notification.method === "string") {
        try {
          this.notificationHandler(notification.method, notification.params);
        } catch {
          // Swallow handler errors to avoid crashing the reader loop
        }
      }
      return;
    }

    // Handle responses to our requests
    const message = msg as unknown as JsonRpcResponse;
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(this.withStderr(`MCP error: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private withNpxYesArg(command: string, args: string[]): string[] {
    const executable = path
      .basename(command)
      .toLowerCase()
      .replace(/\.cmd$/, "");
    if (executable !== "npx") {
      return args;
    }
    if (args.includes("-y") || args.includes("--yes")) {
      return args;
    }
    return ["-y", ...args];
  }

  private appendStderr(text: string): void {
    this.stderrBuffer = `${this.stderrBuffer}${text}`;
    if (this.stderrBuffer.length > 4000) {
      this.stderrBuffer = this.stderrBuffer.slice(-4000);
    }
  }

  private withStderr(message: string): Error {
    const stderr = this.stderrBuffer.trim();
    return new Error(stderr ? `${message}. stderr: ${stderr}` : message);
  }
}

export function createMcpSpawnSpec(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): McpSpawnSpec {
  if (platform === "win32") {
    return {
      // On Windows, shell: true lets cmd.exe resolve the command via PATHEXT
      // (npx -> npx.cmd, etc.). Pass one quoted command line with no spawn
      // args to avoid Node 24 DEP0190.
      command: [command, ...args].map(quoteWindowsShellArg).join(" "),
      args: [],
      shell: true,
      windowsHide: true,
    };
  }

  return {
    command,
    args,
    shell: false,
  };
}

function quoteWindowsShellArg(arg: string): string {
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, "$&$&")}"`;
}

export class HttpMcpClient {
  private nextId = 1;
  private notificationHandler: McpNotificationHandler | null = null;
  private disconnectHandler: ((reason: string) => void) | null = null;
  private intentionallyDisconnected = false;
  private initialized = false;
  private sessionId: string | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private sseResponse: Response | null = null;
  private abortController: AbortController | null = null;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(
    private readonly serverName: string,
    private readonly url: string,
    private readonly debugLogEnabled: boolean,
    onNotification?: McpNotificationHandler,
    onDisconnect?: (reason: string) => void
  ) {
    this.notificationHandler = onNotification ?? null;
    this.disconnectHandler = onDisconnect ?? null;
  }

  private log(message: string): void {
    if (this.debugLogEnabled) {
      logMessage(`[HttpMcpClient][${this.serverName}] ${message}`);
    }
  }

  async connect(timeoutMs: number): Promise<void> {
    this.intentionallyDisconnected = false;

    try {
      await Promise.race([
        this.sendRequest(
          "initialize",
          {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "ue-mcp-agent-ybai", version: "1.0.0" },
          },
          timeoutMs
        ).then((result) => {
          const initResult = result as { protocolVersion?: string; sessionId?: string } | undefined;
          const serverVersion = initResult?.protocolVersion;
          if (
            serverVersion &&
            serverVersion !== "2025-11-25" &&
            serverVersion !== "2025-03-26" &&
            serverVersion !== "2024-11-05"
          ) {
            throw new Error(
              `Unsupported MCP protocol version "${serverVersion}" from server "${this.serverName}". ` +
                `Client supports 2025-11-25, 2025-03-26 and 2024-11-05.`
            );
          }
          if (initResult?.sessionId) {
            this.sessionId = initResult.sessionId;
          }
          this.initialized = true;
          this.sendNotification("notifications/initialized");
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connection timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      // 暂时注释掉 GET 的 SSE 监听，避免和 POST 的 SSE 响应冲突
      // this.startSSEListener();
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  private async startSSEListener(): Promise<void> {
    try {
      this.abortController = new AbortController();
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };

      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      this.sseResponse = await fetch(this.url, {
        method: "GET",
        headers,
        signal: this.abortController.signal,
      });

      if (!this.sseResponse.ok) {
        throw new Error(`Failed to connect to SSE endpoint: ${this.sseResponse.status}`);
      }

      if (!this.sseResponse.body) {
        throw new Error("No response body from SSE endpoint");
      }

      this.sseReader = this.sseResponse.body.getReader();

      const decoder = new TextDecoder();
      let buffer = "";

      while (!this.intentionallyDisconnected) {
        const { done, value } = await this.sseReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventData = line.slice(5).trim();
          } else if (line === "" && eventData) {
            try {
              if (eventType === "message") {
                const parsed = JSON.parse(eventData);
                this.handleMessage(parsed);
              }
            } catch {
              // Ignore invalid JSON
            }
            eventType = "";
            eventData = "";
          }
        }
      }
    } catch (err) {
      if (!this.intentionallyDisconnected && this.disconnectHandler) {
        this.disconnectHandler(err instanceof Error ? err.message : String(err));
      }
    }
  }

  private handleMessage(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    if (!("id" in msg)) {
      const notification = msg as unknown as JsonRpcNotification;
      if (this.notificationHandler && typeof notification.method === "string") {
        try {
          this.notificationHandler(notification.method, notification.params);
        } catch {
          // Ignore notification handler errors
        }
      }
      return;
    }

    const message = msg as unknown as JsonRpcResponse;
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`MCP error: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  async listTools(timeoutMs: number): Promise<McpToolDefinition[]> {
    const tools: McpToolDefinition[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 100; page++) {
      const params = cursor ? { cursor } : {};
      const result = (await this.sendRequest("tools/list", params, timeoutMs)) as ListToolsResult;
      tools.push(...(result.tools ?? []));
      cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
      if (!cursor) {
        return tools;
      }
    }

    throw new Error(`MCP server "${this.serverName}" returned too many tools/list pages`);
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 60_000): Promise<CallToolResult> {
    return (await this.sendRequest("tools/call", { name, arguments: args }, timeoutMs)) as CallToolResult;
  }

  async listPrompts(timeoutMs: number): Promise<McpPromptDefinition[]> {
    try {
      const prompts: McpPromptDefinition[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 100; page++) {
        const params = cursor ? { cursor } : {};
        const result = (await this.sendRequest("prompts/list", params, timeoutMs)) as ListPromptsResult;
        prompts.push(...(result.prompts ?? []));
        cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
        if (!cursor) {
          return prompts;
        }
      }

      throw new Error(`MCP server "${this.serverName}" returned too many prompts/list pages`);
    } catch (_error) {
      // If the server doesn't support prompts/list, return empty array
      return [];
    }
  }

  async getPrompt(name: string, args: Record<string, unknown>, timeoutMs = 30_000): Promise<GetPromptResult> {
    return (await this.sendRequest("prompts/get", { name, arguments: args }, timeoutMs)) as GetPromptResult;
  }

  async listResources(timeoutMs: number): Promise<McpResourceDefinition[]> {
    try {
      const resources: McpResourceDefinition[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 100; page++) {
        const params = cursor ? { cursor } : {};
        const result = (await this.sendRequest("resources/list", params, timeoutMs)) as ListResourcesResult;
        resources.push(...(result.resources ?? []));
        cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
        if (!cursor) {
          return resources;
        }
      }

      throw new Error(`MCP server "${this.serverName}" returned too many resources/list pages`);
    } catch (_error) {
      // If the server doesn't support resources/list, return empty array
      return [];
    }
  }

  async readResource(uri: string, timeoutMs = 30_000): Promise<ReadResourceResult> {
    return (await this.sendRequest("resources/read", { uri }, timeoutMs)) as ReadResourceResult;
  }

  disconnect(): void {
    this.intentionallyDisconnected = true;
    try {
      this.abortController?.abort();
    } catch {
      // Ignore abort errors
    }
    try {
      this.sseReader?.cancel();
    } catch {
      // Ignore reader cancel errors
    }
    this.sseReader = null;
    this.sseResponse = null;
    this.abortController = null;

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Disconnected"));
    }
    this.pendingRequests.clear();
  }

  isConnected(): boolean {
    return this.initialized && !this.intentionallyDisconnected;
  }

  private sendRequest(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for MCP server "${this.serverName}" to respond to ${method}`
          )
        );
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.sendHttpRequest(request).catch((err) => {
        if (this.pendingRequests.has(id)) {
          const pending = this.pendingRequests.get(id)!;
          this.pendingRequests.delete(id);
          clearTimeout(pending.timer);
          pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  private async sendHttpRequest(request: JsonRpcRequest, isNotification: boolean = false): Promise<void> {
    this.log(`发送请求: ${request.method}, id=${request.id}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    this.log(`收到响应: status=${response.status}`);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    // 从响应头中获取 sessionId (不管是不是通知)
    const sessionIdFromHeader = response.headers.get("Mcp-Session-Id");
    if (sessionIdFromHeader) {
      this.log(`从响应头获取 sessionId: ${sessionIdFromHeader}`);
      this.sessionId = sessionIdFromHeader;
    }

    const contentType = response.headers.get("content-type") ?? "";
    this.log(`Content-Type: ${contentType}`);

    // 如果是通知，我们不需要等待响应体，直接返回
    if (isNotification) {
      this.log(`是通知，直接返回`);
      return;
    }

    if (contentType.includes("application/json")) {
      const result = await response.json();
      this.log(`收到 JSON 响应: ${JSON.stringify(result).substring(0, 500)}`);
      this.handleMessage(result);
    } else if (contentType.includes("text/event-stream")) {
      this.log(`收到 SSE 响应，开始解析...`);
      // 处理 SSE 响应，只读取第一个事件，带超时
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventHandled = false;

        let timeoutId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`SSE 响应超时`));
          }, 30000); // 30 秒超时
        });

        try {
          await Promise.race([
            timeoutPromise,
            (async () => {
              while (!eventHandled) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                this.log(`收到 SSE 数据块: ${chunk.length} 字节`);
                this.log(`原始数据: ${chunk.substring(0, 500)}...`);
                buffer += chunk;

                // 解析 SSE 事件
                const normalizedBuffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                const lines = normalizedBuffer.split("\n");
                buffer = lines.pop() || "";

                let eventType = "";
                let eventData = "";

                for (const line of lines) {
                  const trimmedLine = line.trimEnd();
                  if (trimmedLine.startsWith("event:")) {
                    eventType = trimmedLine.slice(6).trim();
                  } else if (trimmedLine.startsWith("data:")) {
                    const dataPart = trimmedLine.slice(5);
                    if (eventData) {
                      eventData += "\n" + dataPart;
                    } else {
                      eventData = dataPart;
                    }
                  } else if (trimmedLine === "" && eventData) {
                    this.log(`收到完整事件: type=${eventType || "none"}, data=${eventData.substring(0, 300)}...`);
                    try {
                      if (eventType === "message" || !eventType) {
                        const parsed = JSON.parse(eventData);
                        this.log(`解析 JSON 成功，调用 handleMessage`);
                        this.handleMessage(parsed);
                        eventHandled = true; // 标记已处理，准备退出
                      }
                    } catch (e) {
                      this.log(`JSON 解析失败: ${e}`);
                      this.log(`错误的 JSON 数据: ${eventData}`);
                    }
                    eventType = "";
                    eventData = "";
                  }
                }
              }
            })(),
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          reader.releaseLock();
        }
      }
    }
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification = {
      jsonrpc: "2.0" as const,
      method,
      params,
    };
    this.sendHttpRequest(notification as JsonRpcRequest, true).catch(() => {});
  }
}
