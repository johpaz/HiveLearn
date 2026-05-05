/**
 * HiveLearn Logger — Sistema de logging completo
 * Copia fiel del logger del repositorio principal de Hive
 * Adaptado para funcionar independientemente
 */
import { mkdirSync, unlinkSync, renameSync, existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

export type LogEntryListener = (entry: LogEntry) => void;

const _logListeners: Set<LogEntryListener> = new Set();

/** Subscribe to real-time log entries */
export function onLogEntry(cb: LogEntryListener): void {
  _logListeners.add(cb);
}

/** Unsubscribe from real-time log entries */
export function removeLogListener(cb: LogEntryListener): void {
  _logListeners.delete(cb);
}

function emitLogEntry(entry: LogEntry): void {
  for (const cb of _logListeners) {
    try { cb(entry); } catch { /* listener error should not crash logger */ }
  }
}

export interface LoggerConfig {
  level: LogLevel;
  dir: string;
  maxSizeMB: number;
  maxFiles: number;
  redactSensitive: boolean;
  console: boolean;
}

export interface LogMeta extends Record<string, unknown> {
  sessionId?: string;
  userId?: string;
  agentId?: string;
  channel?: string;
  toolName?: string;
  duration?: number;
  error?: string;
  stack?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
];

const COLORS = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
};

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || "", p.slice(1));
  }
  return p;
}

function redact(obj: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (seen.has(obj as object)) {
    return "[Circular]";
  }

  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(key));
    if (isSensitive) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redact(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = formatTimestamp();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export class Logger {
  private config: LoggerConfig;
  private logFile: string | null = null;
  private currentSize = 0;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? "info",
      dir: config.dir ?? path.join(getHiveLearnDir(), "logs"),
      maxSizeMB: config.maxSizeMB ?? 10,
      maxFiles: config.maxFiles ?? 5,
      redactSensitive: config.redactSensitive ?? true,
      console: config.console ?? true,
    };
  }

  private initLogFile(): void {
    const logDir = expandPath(this.config.dir);

    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      this.logFile = path.join(logDir, `hivelearn-${new Date().toISOString().split("T")[0]}.log`);

      const file = Bun.file(this.logFile);
      this.currentSize = file.size ?? 0;
    } catch {
      this.logFile = null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private writeToConsole(level: LogLevel, message: string, meta?: unknown): void {
    if (!this.config.console) return;

    const color = COLORS[level];
    const displayMeta = this.config.redactSensitive && meta ? redact(meta) : meta;
    const metaStr = displayMeta && Object.keys(displayMeta as object).length > 0
      ? ` ${JSON.stringify(displayMeta)}`
      : "";

    const prefix = `${COLORS.dim}${formatTimestamp()}${COLORS.reset}`;
    const levelStr = `${color}${COLORS.bright}[${level.toUpperCase().padEnd(5)}]${COLORS.reset}`;

    console.log(`${prefix} ${levelStr} ${message}${metaStr}`);
  }

  private mergeMeta(meta?: unknown): LogMeta | undefined {
    if (!meta) return undefined;
    if (typeof meta !== "object") return meta as LogMeta;
    return meta as LogMeta;
  }

  private writeToFile(message: string): void {
    if (!this.logFile) {
      this.initLogFile();
    }
    if (!this.logFile) return;

    try {
      const line = message + "\n";
      const bytes = Buffer.byteLength(line);

      if (this.currentSize + bytes > this.config.maxSizeMB * 1024 * 1024) {
        this.rotateLogs();
      }

      // Use sync append for logging reliability
      const encoder = new TextEncoder();
      const data = encoder.encode(line);
      Bun.write(this.logFile, data).catch(() => { });
      this.currentSize += bytes;
    } catch {
      // Silently fail if we can't write to log file
    }
  }

  private rotateLogs(): void {
    if (!this.logFile) return;

    const logDir = path.dirname(this.logFile);
    const baseName = path.basename(this.logFile, ".log");

    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(logDir, `${baseName}.${i}.log`);
      const newFile = path.join(logDir, `${baseName}.${i + 1}.log`);

      try {
        if (existsSync(oldFile)) {
          if (i === this.config.maxFiles - 1) {
            unlinkSync(oldFile);
          } else {
            renameSync(oldFile, newFile);
          }
        }
      } catch {
        // Continue rotation even if one file fails
      }
    }

    try {
      renameSync(this.logFile, path.join(logDir, `${baseName}.1.log`));
      this.currentSize = 0;
    } catch {
      // Continue even if rotation fails
    }
  }

  debug(message: string, meta?: unknown): void {
    if (!this.shouldLog("debug")) return;
    const formatted = formatMessage("debug", message, meta);
    this.writeToConsole("debug", message, meta);
    this.writeToFile(formatted);
    emitLogEntry({ timestamp: formatTimestamp(), level: "debug", source: "hivelearn", message, meta: meta as Record<string, unknown> | undefined });
  }

  info(message: string, meta?: unknown): void {
    if (!this.shouldLog("info")) return;
    const formatted = formatMessage("info", message, meta);
    this.writeToConsole("info", message, meta);
    this.writeToFile(formatted);
    emitLogEntry({ timestamp: formatTimestamp(), level: "info", source: "hivelearn", message, meta: meta as Record<string, unknown> | undefined });
  }

  warn(message: string, meta?: unknown): void {
    if (!this.shouldLog("warn")) return;
    const formatted = formatMessage("warn", message, meta);
    this.writeToConsole("warn", message, meta);
    this.writeToFile(formatted);
    emitLogEntry({ timestamp: formatTimestamp(), level: "warn", source: "hivelearn", message, meta: meta as Record<string, unknown> | undefined });
  }

  error(message: string, meta?: unknown): void {
    if (!this.shouldLog("error")) return;
    const formatted = formatMessage("error", message, meta);
    this.writeToConsole("error", message, meta);
    this.writeToFile(formatted);
    emitLogEntry({ timestamp: formatTimestamp(), level: "error", source: "hivelearn", message, meta: meta as Record<string, unknown> | undefined });
  }

  child(context: string): ChildLogger {
    return new ChildLogger(this, context);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

export class ChildLogger {
  constructor(
    private parent: Logger,
    private context: string
  ) { }

  private prefix(message: string): string {
    return `[${this.context}] ${message}`;
  }

  debug(message: string, meta?: unknown): void {
    this.parent.debug(this.prefix(message), meta);
  }

  info(message: string, meta?: unknown): void {
    this.parent.info(this.prefix(message), meta);
  }

  warn(message: string, meta?: unknown): void {
    this.parent.warn(this.prefix(message), meta);
  }

  error(message: string, meta?: unknown): void {
    this.parent.error(this.prefix(message), meta);
  }

  child(subContext: string): ChildLogger {
    return new ChildLogger(
      this.parent,
      `${this.context}:${subContext}`
    );
  }
}

let _logger: Logger | null = null;

/**
 * Obtener el directorio base de HiveLearn
 * Prioridad:
 * 1. HIVELEARN_HOME env var
 * 2. ~/.hivelearn
 */
function getHiveLearnDir(): string {
  const envPath = process.env.HIVELEARN_HOME;
  if (envPath) {
    return expandPath(envPath);
  }
  
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    return path.join(homeDir, ".hivelearn");
  }
  
  // Fallback: directorio actual
  return path.join(process.cwd(), ".hivelearn");
}

/**
 * Cargar configuración desde archivo
 * Busca en:
 * 1. HIVELEARN_CONFIG env var
 * 2. ~/.hivelearn/config.json
 * 3. ./config.json
 */
function loadConfig(): { logging?: { level?: LogLevel } } {
  const configPaths = [
    process.env.HIVELEARN_CONFIG,
    path.join(getHiveLearnDir(), "config.json"),
    path.join(process.cwd(), "config.json"),
  ].filter(Boolean) as string[];

  for (const configPath of configPaths) {
    try {
      if (existsSync(configPath)) {
        const configText = readFileSync(configPath, 'utf-8')
        const config = JSON.parse(configText) as { logging?: { level?: LogLevel } };
        return config;
      }
    } catch {
      // Continue to next config path
    }
  }

  return {};
}

export function getLogger(): Logger {
  if (!_logger) {
    const config = loadConfig();
    _logger = new Logger({ level: config.logging?.level });
  }
  return _logger;
}

export const logger = {
  child: (opts: any) => getLogger().child(opts),
  debug: (msg: string, meta?: unknown) => getLogger().debug(msg, meta),
  info: (msg: string, meta?: unknown) => getLogger().info(msg, meta),
  warn: (msg: string, meta?: unknown) => getLogger().warn(msg, meta),
  error: (msg: string, meta?: unknown) => getLogger().error(msg, meta),
  setLevel: (level: any) => getLogger().setLevel(level),
  setHandler: (handler: any) => { /* no-op for compatibility */ },
};

/**
 * Export redact function for use in middleware
 */
export { redact };

export default logger;
