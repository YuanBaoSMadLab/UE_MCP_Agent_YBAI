import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function getTimestampedLogFileName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `debug-${year}${month}${day}${hours}${minutes}${seconds}.log`;
}

export type OpenAIChatCompletionDebugEntry = {
  timestamp: string;
  location: string;
  requestId?: string;
  sessionId?: string;
  model?: string;
  baseURL?: string;
  durationMs?: number;
  params?: Record<string, unknown>;
  request: Record<string, unknown>;
  response?: unknown;
  responseChunks?: unknown[];
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

export function logOpenAIChatCompletionDebug(entry: OpenAIChatCompletionDebugEntry): void {
  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(toSerializable(entry))}\n`, "utf8");
  } catch {
    // Debug logging must never affect CLI behavior.
  }
}

let cachedLogPath: string | null = null;
export function getDebugLogPath(): string {
  if (cachedLogPath) {
    return cachedLogPath;
  }
  const logsDir = path.join(os.homedir(), ".deepcode", "logs");
  const logFileName = getTimestampedLogFileName();
  cachedLogPath = path.join(logsDir, logFileName);
  return cachedLogPath;
}

export function logMessage(message: string): void {
  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, "utf8");
  } catch {
    // Debug logging must never affect CLI behavior.
  }
}

export function normalizeDebugError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

function toSerializable(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function walk(current: unknown): unknown {
    if (typeof current === "bigint") {
      return current.toString();
    }
    if (current instanceof Error) {
      return normalizeDebugError(current);
    }
    if (!current || typeof current !== "object") {
      return current;
    }
    if (seen.has(current)) {
      return "[Circular]";
    }
    seen.add(current);
    if (Array.isArray(current)) {
      return current.map(walk);
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(current)) {
      result[key] = walk(val);
    }
    return result;
  }

  return walk(value);
}
