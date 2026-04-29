/**
 * HiveLearn Server — Gateway independiente
 *
 * Servidor HTTP + WebSocket en Bun
 * Sin dependencias del repositorio principal de Hive
 */
import { initializeDatabase, getDb } from '../storage/sqlite'
import { initHiveLearnStorage } from '../storage/init'
import { logger } from '../utils/logger'
import { createServer } from './server'

const log = logger.child('server')

const PORT = process.env.HIVELEARN_PORT ? parseInt(process.env.HIVELEARN_PORT) : 8787
const HOST = process.env.HIVELEARN_HOST || '0.0.0.0'
const isDev = process.env.NODE_ENV === 'development'

async function main() {
  log.info('🐝 HiveLearn Server starting...')
  log.info(`📍 Mode: ${isDev ? 'Development' : 'Production'}`)

  // Inicializar base de datos
  try {
    const db = initializeDatabase()
    log.info('✅ Database initialized')

    // Inicializar schemas
    initHiveLearnStorage(db)
    log.info('✅ Database schemas initialized')
  } catch (error) {
    log.error('❌ Database initialization failed', { error: (error as Error).message })
    process.exit(1)
  }

  // Crear servidor
  const server = createServer()

  // Iniciar servidor
  const listener = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: server.fetch,
    websocket: server.websocket,
  })

  log.info(`✅ Server listening on http://${HOST}:${PORT}`)

  if (isDev) {
    log.info('🔨 Development mode: UI served from Vite (localhost:5173)')
  } else {
    log.info('📦 Production mode: UI served from static files')
  }

  log.info('📚 API endpoints:')
  log.info('   GET  /api/hivelearn/config')
  log.info('   POST /api/hivelearn/config')
  log.info('   POST /api/hivelearn/generate')
  log.info('   POST /api/hivelearn/feedback')
  log.info('   GET  /api/hivelearn/sessions')
  log.info('   GET  /api/hivelearn/session/:id')
  log.info('🔌 WebSocket endpoints:')
  log.info('   /hivelearn-onboarding')
  log.info('   /hivelearn-lesson')
  log.info('   /hivelearn-events')
  log.info('🎨 UI available at:')
  log.info(`   http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`)
  log.info('')
  log.info('Press Ctrl+C to stop')

  // Abrir navegador automáticamente (solo si NO_BROWSER no está seteado)
  if (!process.env.NO_BROWSER) {
    const baseUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    log.info(`🎨 UI disponible en: ${baseUrl}/`);
    
    // Esperar a que la UI esté disponible antes de abrir el navegador
    setTimeout(async () => {
      try {
        // Verificar que la UI esté disponible
        const response = await fetch(baseUrl);
        if (response.ok) {
          log.info(`🐝 Abriendo HiveLearn en: ${baseUrl}/`);
          
          const platform = process.platform;
          let shellCmd: string;

          if (platform === "win32") {
            shellCmd = `start "" "${baseUrl}"`;
          } else if (platform === "darwin") {
            shellCmd = `open "${baseUrl}"`;
          } else {
            // Linux
            shellCmd = `gio open "${baseUrl}" 2>/dev/null || xdg-open "${baseUrl}" 2>/dev/null || true`;
          }

          const shell = platform === "win32" ? "cmd" : "/bin/sh";
          const shellArg = platform === "win32" ? "/c" : "-c";

          Bun.spawn([shell, shellArg, shellCmd], {
            detached: true,
            stdio: ["ignore", "ignore", "ignore"]
          });
        } else {
          log.warn(`⚠️  UI no disponible (status: ${response.status}) - navegador no abierto`);
        }
      } catch (err) {
        log.warn(`⚠️  No se pudo verificar la UI: ${(err as Error).message} - navegador no abierto`);
      }
    }, 1500); // Esperar 1.5 segundos a que la UI esté lista
  }
}

main().catch((error) => {
  log.error('Fatal error', { error: (error as Error).message, stack: (error as Error).stack })
  process.exit(1)
})
