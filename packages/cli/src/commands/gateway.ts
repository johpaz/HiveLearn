/**
 * Gateway Command - Refactored with Installation Adapters
 *
 * Manages the Hive Gateway lifecycle using the installation adapter system.
 * Each installation method (Docker, Bun Global, Binary, etc.) is handled
 * by its specific adapter, providing clean separation of concerns.
 */

import { loadConfig, startGateway, logger, getHiveDir, initializeDatabase, registerEmbeddedUI } from "@johpaz/hivelearn-core";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { embeddedUI } from "../ui-bundle.generated";
import pkg from "../../package.json";

const VERSION = pkg.version;
const log = logger.child('gateway-cli')

// Child processes management
const children: ChildProcess[] = []

// Import adapter system
import {
  detectAdapter,
  DockerAdapter,
  BunGlobalAdapter,
  BinaryAdapter,
  type InstallationAdapter,
  type GatewayConfig,
  DEFAULT_GATEWAY_CONFIG,
  PORTS,
  getHiveDir as getAdapterHiveDir,
  findFreePort,
  waitForHttpPort,
  getDistDir,
} from "../adapters";

/**
 * Get the active installation adapter
 * Cached to avoid repeated detection
 */
let _adapter: InstallationAdapter | null = null;

async function getAdapter(): Promise<InstallationAdapter> {
  if (!_adapter) {
    _adapter = await detectAdapter({ verbose: false });
  }
  return _adapter;
}

/**
 * Reset the cached adapter (for testing or forced re-detection)
 */
export function resetAdapter(): void {
  _adapter = null;
}

/**
 * Start UI server with embedded or filesystem assets
 */
function startUIServer(
  uiDir: string | null,
  gatewayPort: number,
  uiPort: number
): void {
  const configScript = `<script>window.__HIVE_CONFIG__={"apiUrl":"http://localhost:${gatewayPort}","wsUrl":"ws://localhost:${gatewayPort}"}</script>`;
  const useEmbedded = embeddedUI.size > 0;

  Bun.serve({
    hostname: "0.0.0.0",
    port: uiPort,
    async fetch(req) {
      const url = new URL(req.url);
      let subPath = url.pathname === "/" ? "/index.html" : url.pathname;
      // SPA fallback: rutas sin extensión → index.html
      if (!path.extname(subPath)) subPath = "/index.html";

      if (useEmbedded) {
        const isIndex = subPath === "/index.html" || !embeddedUI.has(subPath);
        const entry = embeddedUI.get(subPath) ?? embeddedUI.get("/index.html")!;
        if (isIndex) {
          const html = entry.data.toString("utf8").replace("</head>", `${configScript}</head>`);
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        // Convert Buffer to Uint8Array for Response
        return new Response(entry.data as unknown as Uint8Array, { headers: { "Content-Type": entry.mime } });
      }

      // Filesystem path (npm / Docker)
      const filePath = path.join(uiDir!, subPath);
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        const index = Bun.file(path.join(uiDir!, "index.html"));
        if (await index.exists()) {
          const html = (await index.text()).replace("</head>", `${configScript}</head>`);
          return new Response(html, { headers: { "Content-Type": "text/html" } });
        }
        return new Response("Not found", { status: 404 });
      }
      if (subPath === "/index.html") {
        const html = (await file.text()).replace("</head>", `${configScript}</head>`);
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
      return new Response(file);
    },
  });
}

/**
 * Cleanup child processes on exit
 */
function cleanup() {
  if (children.length === 0) return;
  console.log("\n🧹 Limpiando procesos hijos...");
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }
}

// Signal handlers
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

process.on("exit", () => {
  cleanup();
});

/**
 * Get default PID file path
 */
function getDefaultPidFile(): string {
  return path.join(getHiveDir(), "gateway.pid");
}

/**
 * Get log file path
 */
function getLogFile(): string {
  return path.join(getHiveDir(), "logs", "gateway.log");
}

/**
 * Get PID file path from config or default
 */
async function getPidFile(): Promise<string> {
  try {
    const config = await loadConfig();
    return config.gateway?.pidFile || getDefaultPidFile();
  } catch {
    return getDefaultPidFile();
  }
}

/**
 * Ensure log directory exists
 */
function ensureLogDir(): void {
  const logDir = path.dirname(getLogFile());
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Open browser based on platform
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let shellCmd: string;

  if (platform === "win32") {
    shellCmd = `start "" "${url}"`;
  } else if (platform === "darwin") {
    shellCmd = `open "${url}"`;
  } else {
    shellCmd = `gio open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || x-www-browser "${url}" 2>/dev/null || true`;
  }

  console.log(`🌐 Abriendo navegador en ${url}`);

  try {
    const shell = platform === "win32" ? "cmd" : "/bin/sh";
    const shellArg = platform === "win32" ? "/c" : "-c";
    const proc = Bun.spawn([shell, shellArg, shellCmd], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    });
    proc.unref();
  } catch {
    console.log(`\n🌐 Abre Hive aquí: ${url}\n`);
  }
}

/**
 * Check if gateway is running using the adapter
 */
async function isRunning(): Promise<boolean> {
  try {
    // Try adapter first
    const adapter = await getAdapter();
    const adapterRunning = await adapter.isRunning();
    if (adapterRunning) {
      return true;
    }
  } catch {
    // Adapter check failed, fall through to PID check
  }

  // Fallback to PID file check
  const pidFile = await getPidFile();
  if (!existsSync(pidFile)) return false;

  const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
  if (isNaN(pid)) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    try {
      unlinkSync(pidFile);
    } catch { }
    return false;
  }
}
/**
 * Start command - main entry point
 * Simplificado: siempre usa puerto 8787, sin .env, sin adapter config
 * Hace build automático en desarrollo para detectar errores temprano
 */
export async function start(flags: string[]): Promise<void> {
  const daemon = flags.includes("--daemon");
  const skipCheck = flags.includes("--skip-check");
  const isDev = process.argv[1]?.endsWith(".ts");

  // Hardcoded defaults - no adapter config, no .env
  const PORT = 8787;
  const HOST = "127.0.0.1";

  // Auto-build in development mode to catch errors early
  if (isDev && !skipCheck) {
    log.info("🔨 Building in development mode...\n");
    try {
      const { execSync } = await import("node:child_process");
      const rootDir = path.join(process.cwd(), "..", "..");
      
      // Build core
      log.info("📦 Building core...");
      execSync(
        "bun build packages/core/src/index.ts --outdir dist/core --target bun && bun build packages/core/src/gateway/index.ts --bundle --outfile dist/server.js --target bun",
        { stdio: "inherit", cwd: rootDir }
      );
      
      // Build UI
      log.info("📦 Building UI...");
      execSync("bun run build", { stdio: "inherit", cwd: path.join(rootDir, "packages/ui") });
      
      // Build CLI
      log.info("📦 Building CLI...");
      execSync(
        "bun run scripts/generate-ui-bundle.ts && bun build src/index.ts --outfile dist/hive.js --target bun",
        { stdio: "inherit", cwd: path.join(rootDir, "packages/cli") }
      );
      
      log.info("✅ Build completed\n");
    } catch (error) {
      log.error("❌ Build failed. Fix errors and try again.");
      log.error((error as Error).message);
      process.exit(1);
    }
  }

  if (!skipCheck && await isRunning()) {
    console.log("⚠️  Hive Gateway ya está corriendo");
    return;
  }

  // Load core config for logger settings
  try {
    const coreConfig = await loadConfig();
    if (coreConfig.logging?.level) {
      logger.setLevel(coreConfig.logging.level);
    }
  } catch {
    // Use default logger settings
  }

  // Show banner
  console.log(`
 ╔══════════════════════════════════════════════════════════════╗
 ║  🐝 HiveLearn v${VERSION.padEnd(46)}║
 ╚══════════════════════════════════════════════════════════════╝
`);

  // Handle daemon mode
  if (daemon) {
    ensureLogDir();
    const logFile = getLogFile();
    const child = spawn(process.execPath, [process.argv[1] || "", "start", "--skip-check"], {
      detached: true,
      stdio: ["ignore", openSync(logFile, "a"), openSync(logFile, "a")],
      env: { ...process.env, HIVE_GATEWAY_CHILD: "1" },
    });
    child.unref();
    writeFileSync(await getPidFile(), child.pid?.toString() || "");
    console.log(`✅ Hive Gateway iniciado en modo daemon (PID: ${child.pid})`);
    console.log(`   Logs: ${logFile}`);
    return;
  }

  // Set environment
  process.env.HIVELEARN_PORT = PORT.toString();
  process.env.HIVELEARN_HOST = HOST;

  // Si corremos desde el código fuente, reconstruir UI y servir desde disco
  const isRunningFromSource = existsSync(path.join(process.cwd(), 'packages/ui/package.json'))
  if (isRunningFromSource) {
    process.env.NODE_ENV = 'development'
    console.log('🔨 Construyendo UI...')
    const { $ } = await import('bun')
    await $`bun run --cwd packages/ui build`.quiet()
    console.log('✅ UI lista')
    // embeddedUIBundle queda null → server.ts usa packages/ui/dist como fallback
  } else {
    process.env.NODE_ENV = 'production'
    registerEmbeddedUI(embeddedUI)
  }
  const coreConfig = await loadConfig();
  
  logger.info('Starting HiveLearn Gateway', { port: PORT, host: HOST });
  
  await startGateway(coreConfig);
  
  // Open browser
  const url = `http://localhost:${PORT}`;
  console.log(`
╔════════════════════════════════════════╗
║  🎓  HiveLearn — Listo                 ║
╠════════════════════════════════════════╣
║  ${url.padEnd(38)}║
╚════════════════════════════════════════╝
`);
  
  setTimeout(() => {
    try {
      const platform = process.platform;
      let cmd: string;
      if (platform === 'win32') cmd = `start "" "${url}"`;
      else if (platform === 'darwin') cmd = `open "${url}"`;
      else cmd = `gio open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null || true`;
      
      Bun.spawn([platform === 'win32' ? 'cmd' : '/bin/sh', platform === 'win32' ? '/c' : '-c', cmd], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch (e) {
      logger.warn('Could not open browser', { error: (e as Error).message });
    }
  }, 1000);
  
  // Keep alive
  await new Promise(() => {});
}

/**
 * Stop command
 */
export async function stop(): Promise<void> {
  const adapter = await getAdapter();

  // Try adapter stop first
  try {
    if (await adapter.isRunning()) {
      await adapter.stop();
      console.log("✅ Hive Gateway detenido");
      return;
    }
  } catch {
    // Adapter stop failed, fall through to manual stop
  }

  // Fallback to manual PID-based stop
  if (!(await isRunning())) {
    console.log("⚠️  Hive Gateway no está corriendo");
    return;
  }

  const pidFile = await getPidFile();
  const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);

  try {
    process.kill(pid, "SIGTERM");
    unlinkSync(pidFile);
    console.log("✅ Hive Gateway detenido");
  } catch (e) {
    console.error("❌ Error deteniendo el Gateway:", e);
  }
}

/**
 * Status command
 */
export async function status(flags: string[]): Promise<void> {
  const adapter = await getAdapter();
  const adapterConfig = await adapter.getConfig();
  const running = await adapter.isRunning();
  const hiveDir = getHiveDir();

  console.log("🐝 Hive Gateway Status\n");

  const coreConfig = await loadConfig();
  const pid = await adapter.getPid();

  console.log(`Estado:        ${running ? "✅ Corriendo" : "⏹️  Detenido"}`);
  if (running && pid) {
    console.log(`PID:           ${pid}`);
  }
  console.log(`Installation:  ${adapter.name} (${adapterConfig.type})`);
  console.log(`Puerto:        ${adapterConfig.gateway.port}`);
  console.log(`Host:          ${adapterConfig.gateway.host}`);

  const provider = coreConfig.models?.defaultProvider || "no configurado";
  const model = (coreConfig.models as any)?.defaults?.[provider] || (coreConfig.models as any)?.defaults?.default || "no configurado";
  console.log(`Modelo:        ${provider} / ${model}`);
  console.log(`Home:          ${hiveDir}`);
  console.log(`Logs:          ${getLogFile()}`);

  if (flags.includes("--json")) {
    console.log("\n" + JSON.stringify({
      running,
      pid,
      type: adapterConfig.type,
      config: adapterConfig,
    }, null, 2));
  }
}

/**
 * Reload command
 */
export async function reload(): Promise<void> {
  if (!(await isRunning())) {
    console.log("⚠️  Hive Gateway no está corriendo");
    return;
  }

  const pidFile = await getPidFile();
  const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);

  try {
    process.kill(pid, "SIGHUP");
    console.log("✅ Configuración recargada");
  } catch (e) {
    console.error("❌ Error recargando configuración:", e);
  }
}
