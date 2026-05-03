/**
 * MundoWorldPage — Página del Mundo de Aprendizaje HiveLearn
 * 
 * Integra el mundo PixiJS con el estado de la sesión y los stores
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MundoWorld } from '../canvaslearn/mundo2/MundoWorld'
import { useMundoStore } from '../store/mundoStore'
import { useLessonStore } from '../store/lessonStore'
import { WebSocketManager } from '../canvaslearn/mundo2/protocol/WebSocketManager'
import { A2UIBridge } from '../canvaslearn/mundo2/protocol/A2UIBridge'
import type { Zona } from '../canvaslearn/mundo2/types'

/**
 * MundoWorldPage — Contenedor de la página del mundo
 */
export function MundoWorldPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // Estado de carga
  const [isConnected, setIsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)

  // Stores
  const {
    programaUuid,
    sessionId,
    alumnoId,
    tema,
    inicializarMundo,
    setMundoListo,
  } = useMundoStore()

  const { perfil, program } = useLessonStore()

  // Referencias a managers
  const wsManagerRef = React.useRef<WebSocketManager | null>(null)
  const bridgeRef = React.useRef<A2UIBridge | null>(null)

  // Datos del alumno
  const nickname = perfil?.nickname || 'Alumno'
  const avatar = perfil?.avatar || ''

  // Tema del programa
  const temaPrograma = tema || program?.tema || 'Aprendizaje'

  // ─── Verificar programa en DB al montar ──────────────────────────────────

  useEffect(() => {
    if (!programaUuid) {
      navigate('/rio', { replace: true })
      return
    }
    fetch(`/api/hivelearn/programs/${programaUuid}`)
      .then(async r => {
        if (r.status === 404) {
          if (!program) {
            navigate('/nueva-sesion', { replace: true })
            return
          }
          const { getInstanceId } = await import('@/store/lessonStore')
          const instanceId = await getInstanceId()
          fetch('/api/hivelearn/programs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: programaUuid,
              instanceId,
              sessionId: sessionId ?? programaUuid,
              schemaJson: program,
            }),
          }).catch(console.error)
        }
      })
      .catch(console.error)
  }, [programaUuid, navigate, program, sessionId])

  // ─── Inicializar WebSocket ─────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !alumnoId) {
      console.warn('[MundoWorldPage] Esperando sessionId y alumnoId')
      return
    }

    // Configurar WebSocket Manager
    const wsUrl = import.meta.env.VITE_WS_URL || `ws://localhost:3000/ws`

    const wsManager = new WebSocketManager({
      wsUrl,
      sessionId,
      alumnoId,
      autoReconnect: true,
      reconnectInterval: 3000,
    })

    // Callbacks de estado
    wsManager.onStateChange = (state) => {
      console.log('[WebSocket] Estado:', state)
      setIsConnected(state === 'connected')

      if (state === 'error') {
        setWsError('Error de conexión. Reconectando...')
      } else if (state === 'connected') {
        setWsError(null)
      }
    }

    wsManager.onError = (error) => {
      console.error('[WebSocket] Error:', error)
      setWsError(error.message)
    }

    // Suscribirse a eventos del mundo
    wsManager.on('mundo:*', (message) => {
      console.log('[MundoWorldPage] Evento del mundo:', message)

      // Procesar evento en el bridge
      if (bridgeRef.current) {
        bridgeRef.current.procesarMensajeServidor(message)
      }
    })

    // Conectar
    wsManager.connect()
    wsManagerRef.current = wsManager

    // Cleanup
    return () => {
      wsManager.disconnect()
      wsManagerRef.current = null
    }
  }, [sessionId, alumnoId])

  // ─── Inicializar A2UI Bridge ───────────────────────────────────────────────

  useEffect(() => {
    if (!wsManagerRef.current) return

    // Crear bridge
    const bridge = new A2UIBridge({
      sessionId: sessionId || '',
      alumnoId: alumnoId || '',
      mundoRef: {
        playerRef: { current: null },
        zoneManager: null,
        particleSystem: null,
        wsManager: wsManagerRef.current,
      } as any,
    })

    bridgeRef.current = bridge

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [sessionId, alumnoId])

  // ─── Handlers de interacción ───────────────────────────────────────────────

  const handleZoneInteract = useCallback((zona: Zona) => {
    console.log('[MundoWorldPage] Interacción con zona:', zona)

    // Enviar evento de interacción
    if (bridgeRef.current) {
      bridgeRef.current.enviarInteraccionZona(zona.numero, 'entrar')
    }

    // TODO: Mostrar contenido A2UI de la zona
    // navigate(`/lesson?zona=${zona.numero}&modulo=${zona.moduloUuid}`)
  }, [])

  const handleAnswer = useCallback((moduloUuid: string, respuesta: any) => {
    console.log('[MundoWorldPage] Respuesta del alumno:', { moduloUuid, respuesta })

    // Enviar respuesta vía WebSocket
    if (bridgeRef.current && sessionId) {
      bridgeRef.current.enviarRespuesta(
        moduloUuid,
        moduloUuid,
        respuesta,
        1 // intento
      )
    }
  }, [sessionId])

  // ─── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (!sessionId || !alumnoId) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0e27]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#fbbf24] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[#fbbf24] font-bold text-lg animate-pulse">
            Cargando mundo...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27]">
      {/* Mundo PixiJS */}
      <MundoWorld
        programaUuid={programaUuid || sessionId}
        sessionId={sessionId}
        alumnoId={alumnoId}
        nickname={nickname}
        avatar={avatar}
        tema={temaPrograma}
        onZoneInteract={handleZoneInteract}
        onAnswer={handleAnswer}
      />

      {/* Overlay de estado de conexión */}
      <div className="absolute top-4 right-4 pointer-events-none">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm ${isConnected
            ? 'bg-[#22c55e]/20 border border-[#22c55e]/40 text-[#22c55e]'
            : 'bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444]'
          }`}>
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              Conectado
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
              {wsError || 'Conectando...'}
            </>
          )}
        </div>
      </div>

      {/* Botón de salir */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate('/sessions')}
          className="px-4 py-2 bg-[#1a1f3a] hover:bg-[#2a3550] border border-[#2a3550] rounded-xl text-white text-sm font-medium transition-all"
        >
          ← Salir del mundo
        </button>
      </div>
    </div>
  )
}

export default MundoWorldPage
