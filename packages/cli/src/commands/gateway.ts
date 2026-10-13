/**
 * Gateway Command - Refactored with Installation Adapters
 *
 * Manages the Hive Gateway lifecycle using the installation adapter system.
 * Each installation method (Docker, Bun Global, Binary, etc.) is handled
 * by its specific adapter, providing clean separation of concerns.
 */

import { loadConfig, startGateway, logger, getHiveDir, registerEmbeddedUI } from "@hivelearn/core";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync } from "node:fs";
import * as path from "node:path";
import { spawn, ChildProcess } from "child_process";
import { embeddedUI } from "../ui-bundle.generated";
import pkg from "../../package.json";

const VERSION = pkg.version;

// Import adapter system
import { detectAdapter, type InstallationAdapter, type GatewayConfig, PORTS, waitForHttpPort, isDevMode, isChildProcess, getDistDir } from "../adapters"

const children: ChildProcess[] = [];

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
 */
export async function start(flags: string[]): Promise<void> {
  const daemon = flags.includes("--daemon");
  const skipCheck = flags.includes("--skip-check");
  const devInternal = flags.includes("--dev-internal");

  const isDev = isDevMode();
  const isChild = isChildProcess();

  // Detect and set adapter
  const adapter = await getAdapter();
  const config = await adapter.getConfig();

  // Skip onboarding check if running as child process
  const isGatewayChild = process.env.HIVE_GATEWAY_CHILD === "1";

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

  // Show banner only if not running as child process
  if (!isGatewayChild) {
    console.log(`
 ╔══════════════════════════════════════════════════════════════╗
 ║                                                              ║
 ║              _    _  _____ __      __ ______                 ║
 ║             | |  | ||_   _|\\ \\    / /|  ____|                ║
 ║             | |__| |  | |   \\ \\  / / | |__                   ║
 ║             |  __  |  | |    \\ \\/ /  |  __|                  ║
 ║             | |  | | _| |_    \\  /   | |____                 ║
 ║             |_|  |_||_____|    \\/    |______|                ║
 ║                                                              ║
 ║           _       ______          _____   _   _              ║
 ║          | |     |  ____|   /\\   |  __ \\ | \\ | |             ║
 ║          | |     | |__     /  \\  | |__) ||  \\| |             ║
 ║          | |     |  __|   / /\\ \\ |  _  / | . \` |             ║
 ║          | |____ | |____ / ____ \\| | \\ \\ | |\\  |             ║
 ║          |______||______/_/    \\_\\_|  \\_\\_| \\_|              ║
 ║                                                              ║
 ║  🐝 Personal AI Swarm Education — v${VERSION.padEnd(10)} ║
 ╚══════════════════════════════════════════════════════════════╝

📦 Installation: ${adapter.name}
`);
  }

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

  // Development mode
  if (isDev) {
    await handleDevMode(adapter, config.gateway, daemon);
    return;
  }

  // Production mode
  await handleProductionMode(adapter, config.gateway, daemon);
}

/**
 * Handle development mode startup
 * Gateway serves built UI with HMR injection (Vite on 5173 for hot reload only)
 */
async function handleDevMode(
  adapter: InstallationAdapter,
  gatewayConfig: GatewayConfig,
  daemon: boolean
): Promise<void> {
  if (isChildProcess()) {
    logger.info("Starting Gateway server (child process)...");
    registerEmbeddedUI(embeddedUI);
    const coreConfig = await loadConfig();
    await startGateway(coreConfig);
    return;
  }

  // Kill any existing process on the gateway port before spawning
  try {
    const { execSync } = await import("node:child_process");
    const pids = execSync(`lsof -ti :${PORTS.GATEWAY}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        try { process.kill(parseInt(pid), "SIGTERM"); } catch { }
      }
      await Bun.sleep(500);
    }
  } catch { }

  // Spawn Gateway child process
  const spawnGateway = (): ReturnType<typeof spawn> => {
    const gw = spawn(process.execPath, [process.argv[1] || "", "start", "--skip-check"], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HIVE_DEV: "true", NODE_ENV: "development", HIVE_GATEWAY_CHILD: "1" },
    });

    gw.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) console.log(`[Gateway] ${line}`);
      }
    });

    gw.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) console.error(`[Gateway] ${line}`);
      }
    });

    gw.on("error", (error) => {
      console.error(`❌ Error iniciando Gateway: ${error.message}`);
    });

    gw.on("exit", (code) => {
      if (code === 0) {
        console.log("[Gateway] Reiniciando tras setup...");
        const newGw = spawnGateway();
        const idx = children.indexOf(gw);
        if (idx !== -1) children.splice(idx, 1, newGw);
      }
    });

    if (!daemon) {
      children.push(gw);
    } else {
      gw.unref();
    }

    return gw;
  };

  const gatewayProcess = spawnGateway();
  console.log(`[CLI] Gateway spawned, pid=${gatewayProcess.pid}`);

  // Wait for gateway
  console.log("⏳ Esperando gateway...");
  console.log(`[CLI] Waiting for gateway on port ${PORTS.GATEWAY}...`);
  const gatewayReady = await waitForHttpPort(PORTS.GATEWAY, "/health", 30000);
  console.log(`[CLI] Gateway ready: ${gatewayReady}`);

  if (!gatewayReady) {
    console.error("⚠️  Gateway no respondió a tiempo");
    return;
  }

  await Bun.sleep(300);

  console.log("✅ Gateway listo\n");

  // Open browser - HiveLearn no requiere setup
  const url = `http://localhost:${PORTS.GATEWAY}`;

  console.log(`
╔════════════════════════════════════════╗
║  🐝  HiveLearn — Listo                 ║
╠════════════════════════════════════════╣
║  UI:        ${url.padEnd(24)}║
║  API:       http://127.0.0.1:${PORTS.GATEWAY}     ║
║  WebSocket: ws://127.0.0.1:${PORTS.GATEWAY}/ws   ║
║  Canvas:    ws://127.0.0.1:${PORTS.GATEWAY}/canvas║
╠════════════════════════════════════════╣
║  🎓 Administrando tu aprendizaje       ║
╚════════════════════════════════════════╝
`);

  openBrowser(url);

  if (!daemon) {
    await new Promise(() => { }); // Infinite wait
  }
}

/**
 * Handle production mode startup
 */
async function handleProductionMode(
  adapter: InstallationAdapter,
  gatewayConfig: GatewayConfig,
  daemon: boolean
): Promise<void> {
  if (isChildProcess()) {
    process.env.NODE_ENV = 'production';
    registerEmbeddedUI(embeddedUI);
    const coreConfig = await loadConfig();
    await startGateway(coreConfig);
    return;
  }

  // Get UI directory from adapter config
  const adapterConfig = await adapter.getConfig();
  // Detect Docker environment
  const isDocker = adapterConfig.type === "docker"
    || (adapterConfig.type === "binary" && process.env.HIVE_UI_DIR === "/app/ui");

  const uiPort = gatewayConfig.port;
  const spawnGatewayProd = (): ReturnType<typeof spawn> => {
    // Determine the correct command to spawn the gateway child process.
    // Three cases:
    //   1. Docker container (/app/hive-server)
    //   2. Bundled JS or TS source → bun <script> start --skip-check
    //   3. Compiled Bun binary (no .js/.ts extension) → re-exec process itself
    const scriptPath = process.argv[1] || "";
    const isDockerContainer = process.env.HIVE_UI_DIR === "/app/ui";
    const isBunScript = scriptPath.endsWith(".js") || scriptPath.endsWith(".ts");

    let command: string;
    let args: string[];

    if (isDockerContainer) {
      // Running inside Docker container
      command = "/app/hive-server";
      args = ["start", "--skip-check"];
    } else if (isBunScript) {
      // Bundled JS (npm package) or TypeScript source: use Bun runtime
      command = process.execPath;
      args = [scriptPath, "start", "--skip-check"];
    } else {
      // Compiled Bun binary: process.execPath IS the binary
      command = process.execPath;
      args = ["start", "--skip-check"];
    }

    // Create clean environment without NODE_ENV from parent
    const childEnv = { ...process.env };
    delete childEnv.NODE_ENV;

    const gw = spawn(command, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...childEnv, NODE_ENV: "production", HIVE_GATEWAY_CHILD: "1", ...(getDistDir() ? { HIVE_DIST_DIR: getDistDir()! } : {}) },
    });

    gw.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) console.log(`[Gateway] ${line}`);
      }
    });

    gw.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) console.error(`[Gateway] ${line}`);
      }
    });

    gw.on("error", (error) => {
      console.error(`❌ Error iniciando Gateway: ${error.message}`);
    });

    gw.on("exit", (code) => {
      if (code === 0) {
        console.log("[Gateway] Reiniciando tras setup...");
        const newGw = spawnGatewayProd();
        const idx = children.indexOf(gw);
        if (idx !== -1) children.splice(idx, 1, newGw);
      }
    });

    children.push(gw);
    return gw;
  };

  spawnGatewayProd();

  // Open browser when gateway is ready - HiveLearn no requiere setup
  const gatewayPort = gatewayConfig.port || 8787;
  waitForHttpPort(gatewayPort, "/", 30000).then((ready) => {
    if (!ready) {
      console.error(`Gateway did not respond in time`);
      return;
    }
    const url = `http://localhost:${gatewayPort}`;

    console.log(`
╔════════════════════════════════════════╗
║  🎓  HiveLearn — Listo                 ║
╠════════════════════════════════════════╣
║  Abriendo navegador:                   ║
║  ${url.padEnd(38)}║
╚════════════════════════════════════════╝
`);

    openBrowser(url);
  });

  await new Promise(() => { }); // Keep parent alive
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
