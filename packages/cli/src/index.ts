#!/usr/bin/env bun
import { start, stop, status, reload } from "./commands/gateway";

import { config } from "./commands/config";
import { chat } from "./commands/chat";
import { doctor } from "./commands/doctor";
import { securityAudit } from "./commands/security";
import { update } from "./commands/update";
import { message } from "./commands/message";
import { agent } from "./commands/agent-run";
import { migrate } from "./commands/migrate";
import pkg from "../../../package.json";

const VERSION = pkg.version;

const HELP = `
🐝 HiveLearn — Personal AI Swarm Education v${VERSION}

Usage: hivelearn <command> [subcommand] [options]

Gateway:
  start [--daemon]           Arrancar el Gateway (abre setup web si es primera vez)
  dev                        Modo desarrollo con hot-reload (usa ~/.hive-dev)
  stop                       Detener el Gateway
  reload                     Recargar config sin reiniciar
  status                     Estado del Gateway

Chat y mensajes:
  chat [--agent <id>]        Chat directo en terminal
  message send --to <id> --content <text>
                             Enviar mensaje por canal
  agent run --message <text> [--wait]
                             Ejecutar agente con mensaje

Configuración:
  config get <key>           Leer valor de config
  config set <key> <value>   Escribir valor de config
  config show                Mostrar config completa

Sistema:
  doctor                     Diagnóstico completo y auto-reparación
  update                     Actualizar HiveLearn a la última versión
  migrate                    Migrar schema y datos de la BD existente
  security audit             Auditoría de seguridad del entorno

Options:
  --help, -h                 Mostrar esta ayuda
  --version, -v              Mostrar versión

Examples:
  hivelearn start                 Arrancar HiveLearn (el browser se abre automáticamente)
  hivelearn chat                  Chatear con el agente en terminal
  hivelearn message send --to 123 --content "Hola"
  hivelearn agent run --message "Analiza README.md" --wait
  hivelearn doctor                Diagnosticar problemas del sistema
  hivelearn update                Actualizar a la última versión
`;

async function main(): Promise<void> {
  // In compiled Bun binaries, process.argv is [binaryPath, arg0, arg1, ...]
  // In dev mode (bun run script.ts), it is [bun, scriptPath, arg0, arg1, ...]
  // We detect dev mode by checking if argv[1] ends with .ts
  const isDev = process.argv[1]?.endsWith(".ts");
  // Skip bun executable and script path in dev mode
  const args = process.argv.slice(isDev ? 2 : 1);
  // Skip script path in compiled mode (first arg is the script/binary path)
  const normalizedArgs = args[0]?.includes("\\") || args[0]?.includes("/") ? args.slice(1) : args;
  const command = normalizedArgs[0];
  const subcommand = normalizedArgs[1];
  const flags = normalizedArgs.filter((a) => a.startsWith("--"));

  switch (command) {
    case "start":
      await start(flags);
      break;
    case "stop":
      await stop();
      break;
    case "reload":
      await reload();
      break;
    case "status":
      await status(flags);
      break;
    case "chat":
      await chat(flags);
      break;
    case "message":
      await message(subcommand, args.slice(2));
      break;
    case "agent":
      await agent(subcommand, args.slice(2));
      break;
    case "config":
      await config(subcommand, args.slice(2));
      break;
    case "doctor":
      await doctor();
      break;
    case "security":
      if (subcommand === "audit") {
        await securityAudit();
      } else {
        console.log("Usage: hivelearn security audit");
      }
      break;
    case "update":
      await update();
      break;
    case "migrate":
      await migrate();
      break;
    case "--version":
    case "-v":
    case "version":
      console.log(`HiveLearn v${VERSION}`);
      process.exit(0);
      break;
    case "--help":
    case "-h":
    case "help":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`❌ Comando desconocido: "${command}"\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
