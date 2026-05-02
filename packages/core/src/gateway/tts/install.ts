#!/usr/bin/env bun
/**
 * Hive TTS — postinstall
 * Descarga el binario de Piper + shared libs y el modelo de voz español.
 * Solo descarga si no están ya presentes en packages/tts/bin/ y voices/
 */

import { existsSync, mkdirSync, readdirSync, renameSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  detectPlatform,
  PIPER_URLS,
  getPiperBinaryName,
  DEFAULT_VOICE,
  AVAILABLE_VOICES,
} from "./detect.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname
const BIN_DIR = join(ROOT, "bin")
const VOICES_DIR = join(ROOT, "voices")

export function ensureTTSDirs() {
  mkdirSync(BIN_DIR, { recursive: true })
  mkdirSync(VOICES_DIR, { recursive: true })
}

export function checkTTSInstallation(): { installed: boolean; piper: boolean; voices: string[] } {
  const platform = detectPlatform()
  const binaryName = getPiperBinaryName(platform)
  const piper = existsSync(join(BIN_DIR, binaryName))
  
  const voices = existsSync(VOICES_DIR) 
    ? readdirSync(VOICES_DIR)
        .filter(f => f.endsWith(".onnx"))
        .map(f => f.replace(".onnx", ""))
    : []

  return { installed: piper && voices.length > 0, piper, voices }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const filename = url.split("/").pop()!
  console.log(`  Descargando ${filename}...`)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`)

  // Usar arrayBuffer() — Bun.write(dest, Response) no consume el body correctamente
  const totalBytes = Number(res.headers.get("content-length") ?? 0)
  const buf = await res.arrayBuffer()
  await Bun.write(dest, buf)

  const mb = (buf.byteLength / 1024 / 1024).toFixed(1)
  console.log(`  ✓ ${filename} — ${mb} MB`)
}

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  const proc = Bun.spawn(["tar", "-xzf", archivePath, "-C", destDir], {
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`tar falló con código ${code}`)
  await Bun.spawn(["rm", "-f", archivePath]).exited
}

async function extractZip(archivePath: string, destDir: string): Promise<void> {
  const proc = Bun.spawn(["unzip", "-q", archivePath, "-d", destDir], {
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`unzip falló con código ${code}`)
  await Bun.spawn(["rm", "-f", archivePath]).exited
}

export async function installPiper(): Promise<void> {
  const platform = detectPlatform()
  const binaryName = getPiperBinaryName(platform)
  const binaryPath = join(BIN_DIR, binaryName)

  if (existsSync(binaryPath)) {
    console.log("✓ Piper ya instalado, omitiendo descarga.")
    return
  }

  const url = PIPER_URLS[platform]
  const archiveExt = url.endsWith(".zip") ? ".zip" : ".tar.gz"
  const archivePath = join(BIN_DIR, `piper${archiveExt}`)

  console.log(`\nHive TTS — instalando Piper para ${platform}...`)
  await downloadFile(url, archivePath)

  console.log("  Extrayendo...")
  if (archiveExt === ".zip") {
    await extractZip(archivePath, BIN_DIR)
  } else {
    await extractTarGz(archivePath, BIN_DIR)
  }

  // El tar extrae en piper/ con el binario Y sus shared libraries.
  // Mover TODO el contenido de piper/ a BIN_DIR — el binario necesita las .so junto a él.
  // Usamos nombre temporal para evitar colisión: bin/piper/piper → bin/piper (directorio existe)
  const piperSubdir = join(BIN_DIR, "piper")
  if (existsSync(piperSubdir)) {
    const tempDir = join(BIN_DIR, "_piper_tmp")
    renameSync(piperSubdir, tempDir)           // bin/piper/ → bin/_piper_tmp/
    for (const entry of readdirSync(tempDir)) {
      renameSync(join(tempDir, entry), join(BIN_DIR, entry))
    }
    await Bun.spawn(["rm", "-rf", tempDir]).exited
  }

  if (!existsSync(binaryPath)) {
    throw new Error(`Binario no encontrado tras extracción: ${binaryPath}`)
  }

  if (!platform.startsWith("windows")) {
    await Bun.spawn(["chmod", "+x", binaryPath]).exited
  }

  console.log(`✓ Piper instalado en ${BIN_DIR}`)
}

export async function installVoice(voiceId: string = DEFAULT_VOICE): Promise<void> {
  const voice = AVAILABLE_VOICES.find(v => v.id === voiceId)
  if (!voice) throw new Error(`Voz no configurada: ${voiceId}`)

  const modelPath = join(VOICES_DIR, `${voiceId}.onnx`)
  const configPath = join(VOICES_DIR, `${voiceId}.onnx.json`)

  if (existsSync(modelPath) && existsSync(configPath)) {
    console.log(`✓ Voz '${voice.name}' ya instalada, omitiendo descarga.`)
    return
  }

  console.log(`\nDescargando modelo de voz: ${voice.name}...`)

  await downloadFile(voice.modelUrl, modelPath)
  await downloadFile(voice.configUrl, configPath)

  console.log(`✓ Voz '${voice.name}' instalada en ${VOICES_DIR}`)
}

export function checkVoiceInstalled(voiceId: string): boolean {
  return existsSync(join(VOICES_DIR, `${voiceId}.onnx`)) && 
         existsSync(join(VOICES_DIR, `${voiceId}.onnx.json`))
}

async function main(): Promise<void> {
  try {
    await installPiper()
    await installVoice()
    console.log("\n✅ Hive TTS listo. Inicialo con: bun run packages/core/src/gateway/tts/server.ts\n")
  } catch (err) {
    console.error("\n⚠  Hive TTS no pudo instalarse:")
    console.error(err instanceof Error ? err.message : err)
    console.error("Reintenta con: bun run packages/core/src/gateway/tts/install.ts\n")
    process.exit(1)
  }
}

main()
