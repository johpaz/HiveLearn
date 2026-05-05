import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RioMundo } from '@/canvaslearn/rio'
import { RioA2UIBridge } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import { IsometricRenderer } from '@/canvaslearn/rio/renderer/IsometricRenderer'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { useRioLive } from '@/hooks/useRioLive'
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

  // ─── Create A2UI Bridge ────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !alumnoId) return

    const bridge = new RioA2UIBridge({
      sessionId,
      alumnoId,
      rioRef: rioBridgeObj.current,
    })
    bridgeRef.current = bridge

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [sessionId, alumnoId])

  // ─── Connect WebSocket ──────────────────────────────────────────────────────

  const {
    isConnected,
    isGenerating,
    currentAgentId,
    currentAgentName,
    error: wsError,
    a2uiMessages,
  } = useRioLive()

  // ─── Handle login phase transitions ────────────────────────────────────────

  useEffect(() => {
    if (loginPhase === 'restoring_session' && perfil) {
      // Existing student — restore session
      if (perfil.alumnoId) {
        setAlumnoId(perfil.alumnoId)
      }
      const savedUuid = useRioMundoStore.getState().programaUuid
      if (savedUuid) {
        setLoginPhase('entering_world')
      } else {
        setLoginPhase('entering_world')
      }
    }
  }, [loginPhase, perfil])

  // ─── Create session when entering world ─────────────────────────────────────

  useEffect(() => {
    if (loginPhase === 'entering_world' && alumnoId && !sessionId) {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
    }
  }, [loginPhase, alumnoId, sessionId])

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
      sendWs({
        tipo: 'iniciar_generacion',
        perfil: perfilData,
        meta: metaStr,
        sessionId,
        alumnoId,
      })
    }
  }, [loginPhase, sessionId, alumnoId, programaUuid])

  // ─── Fetch program when generation completes ─────────────────────────────────

  useEffect(() => {
    if (!isGenerating && sessionId && !programaUuid && alumnoId) {
      // Generation might have completed, request program via WS
      const sendWs = useRioMundoStore.getState().sendWsMessage
      if (sendWs) {
        sendWs({
          tipo: 'obtener_programa',
          alumnoId,
        })
      }
    }
  }, [isGenerating, sessionId, programaUuid, alumnoId])

  // ─── Handle WS errors ───────────────────────────────────────────────────────

  useEffect(() => {
    if (wsError && isConnected) {
      // Connection was working but now has an error - show briefly
      console.warn('[RioMundoPage] WS error:', wsError)
    }
  }, [wsError, isConnected])

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