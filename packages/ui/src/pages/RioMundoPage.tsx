import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RioMundo } from '@/canvaslearn/rio'
import { RioA2UIBridge } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'

export function RioMundoPage() {
  const navigate = useNavigate()
  const bridgeRef = useRef<RioA2UIBridge | null>(null)
  // rioBridgeRef will be populated after PixiJS initializes
  const rioBridgeObj = useRef<import('@/canvaslearn/rio/protocol/RioA2UIBridge').RioBridgeRef>({ renderer: null, dialog: null })

  const {
    loginPhase,
    alumnoId,
    sessionId,
    programaUuid,
    perfil,
    nickname,
    meta,
    setLoginPhase,
    setSessionId,
    setAlumnoId,
    setPerfil,
    setProgramaUuid,
    setTema,
  } = useRioMundoStore()

  const generationEverStartedRef = useRef(false)

  // ─── Create A2UI Bridge ────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !alumnoId) return

    const bridge = new RioA2UIBridge({
      sessionId,
      alumnoId,
      rioRef: rioBridgeObj.current,
    })
    bridgeRef.current = bridge
    ;(useRioMundoStore.getState() as any)._rioBridge = bridge

    return () => {
      bridge.destroy()
      bridgeRef.current = null
      ;(useRioMundoStore.getState() as any)._rioBridge = null
    }
  }, [sessionId, alumnoId])

  // ─── WS state from store (connection managed globally by WsConnection in App) ─

  const isConnected = useRioMundoStore(s => s.wsStatus === 'connected')
  const isGenerating = useRioMundoStore(s => s.isGenerating)
  const currentAgentName = useRioMundoStore(s => s.swarmProgress.currentAgentName)

  // ─── Handle login phase transitions ────────────────────────────────────────

  useEffect(() => {
    if (loginPhase === 'restoring_session' && perfil) {
      // Existing student — restore session
      if (perfil.alumnoId) {
        setAlumnoId(perfil.alumnoId)
      }
      const state = useRioMundoStore.getState()
      const savedUuid = state.programaUuid
      if (savedUuid) {
        // Ya tenemos programa en memoria, entrar directo
        setLoginPhase('entering_world')
      } else {
        // Sin programa en memoria — pedir reanudación desde BD
        if (state.sendWsMessage && perfil.alumnoId) {
          state.sendWsMessage({
            tipo: 'reanudar_sesion',
            alumnoId: perfil.alumnoId,
          })
        }
        // Mientras llega la respuesta, quedarse en restoring_session
        // El handler en useRioLive cambiará a 'in_world' si hay sesión
        // Si no hay sesión, el usuario debe esperar o reiniciar
      }
    }
  }, [loginPhase, perfil, setAlumnoId, setLoginPhase])

  // ─── Create session when entering world ─────────────────────────────────────

  useEffect(() => {
    if (loginPhase === 'entering_world' && alumnoId && !sessionId) {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
    }
  }, [loginPhase, alumnoId, sessionId])

  // ─── Redirigir a /programa si no hay programa listo ─────────────────────────
  // /rio es solo el mundo de juego. Welcome, login y creación viven en /programa.
  // Si llegamos aquí sin programaUuid, volvemos a /programa.

  useEffect(() => {
    if (programaUuid) return
    navigate('/programa', { replace: true })
  }, [programaUuid, navigate])

  // ─── Start program generation after onboarding ──────────────────────────────

  useEffect(() => {
    if (loginPhase !== 'in_world') return
    if (!sessionId || !alumnoId) return
    if (programaUuid) return // Already have a program

    const state = useRioMundoStore.getState()
    const tema = state.onboarding.tema || state.meta || 'Aprendizaje general'
    const objetivo = state.onboarding.objetivo || 'Aprender algo nuevo'
    const estilo = state.onboarding.estilo || 'visual'

    // Build profile from onboarding data
    const perfilData = {
      alumnoId,
      nombre: state.onboarding.nombre || nickname || 'Estudiante',
      nickname: nickname || 'Estudiante',
      avatar: '',
      edad: state.onboarding.edad || 18,
      estado: 'activo' as const,
      sesionesTotal: 0,
      xpAcumulado: 0,
    }

    // Create session + start generation via WS
    const metaStr = `Tema: ${tema}. Objetivo: ${objetivo}. Estilo: ${estilo}.`
    setTema(tema)

    const sendWs = useRioMundoStore.getState().sendWsMessage
    if (sendWs) {
      sendWs({
        tipo: 'crear_sesion',
        alumnoId,
        sessionId,
        tema,
        objetivo,
      })
      // El tour interactivo ejecuta cada agente vía 'ejecutar_agente'.
      // No disparar runSwarmGeneration en paralelo — el alumno controla el ritmo.
    }
  }, [loginPhase, sessionId, alumnoId, programaUuid])

  // ─── Fetch program when generation completes ─────────────────────────────────

  useEffect(() => {
    if (isGenerating) {
      generationEverStartedRef.current = true
    }
  }, [isGenerating])

  useEffect(() => {
    // Solo solicitar programa si ya empezó la generación y acaba de completarse
    if (loginPhase !== 'in_world') return
    if (!generationEverStartedRef.current) return
    if (isGenerating) return
    if (!sessionId || !alumnoId || programaUuid) return

    const sendWs = useRioMundoStore.getState().sendWsMessage
    if (sendWs) {
      sendWs({ tipo: 'obtener_programa', alumnoId })
    }
  }, [loginPhase, isGenerating, sessionId, programaUuid, alumnoId])

  // ─── Guard: no montar RioMundo (Pixi+audio) hasta tener programa ─────────────
  // Si llegamos sin programa, el useEffect de arriba ya redirige a /programa.
  // Mientras tanto, evitar inicializar Pixi y AudioManager en vano.

  if (!programaUuid) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-bounce">🐝</div>
          <p className="text-[#fbbf24] font-bold text-sm">Preparando tu programa…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#1a3c2a]">
      <RioMundo />

      {/* Connection status indicator — visible en todas las fases del juego */}
      <div className="absolute top-4 right-4 pointer-events-none z-50">
        <ConnectionIndicator />
      </div>

      {/* Generation progress */}
      {isGenerating && loginPhase === 'in_world' && (
        <div className="absolute top-16 right-4 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#fbbf24] animate-pulse" />
            <span className="text-[#fbbf24] text-sm font-bold">
              {currentAgentName ? `${currentAgentName} trabajando...` : 'Generando programa...'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default RioMundoPage