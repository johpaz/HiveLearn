import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RioMundo } from '@/canvaslearn/rio'
import { RioA2UIBridge } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import { IsometricRenderer } from '@/canvaslearn/rio/renderer/IsometricRenderer'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { useRioLive } from '@/hooks/useRioLive'

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
  } = useRioLive(sessionId, alumnoId)

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

    // Create session + start generation
    const metaStr = `Tema: ${tema}. Objetivo: ${objetivo}. Estilo: ${estilo}.`
    setTema(tema)

    fetch('/api/hivelearn/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alumnoId,
        sessionId,
        tema,
        objetivo,
      }),
    }).then(() => {
      // Start generation
      return fetch('/api/hivelearn/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil: perfilData,
          meta: metaStr,
          sessionId,
          alumnoId,
        }),
      })
    }).then(res => res.json()).then(data => {
      if (data.swarmId || data.ok) {
        useRioMundoStore.getState().setIsGenerating(true)
      }
    }).catch(err => {
      console.error('[RioMundoPage] Error starting generation:', err)
    })
  }, [loginPhase, sessionId, alumnoId, programaUuid])

  // ─── Fetch program when generation completes ─────────────────────────────────

  useEffect(() => {
    if (!isGenerating && sessionId && !programaUuid && alumnoId) {
      // Generation might have completed, try to fetch program
      fetch(`/api/hivelearn/sessions?alumnoId=${alumnoId}`)
        .then(res => res.json())
        .then(data => {
          if (data.sessions && data.sessions.length > 0) {
            const latestSession = data.sessions[data.sessions.length - 1]
            if (latestSession.programa_uuid) {
              setProgramaUuid(latestSession.programa_uuid)
            }
          }
        })
        .catch(() => {})
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

      {/* Connection status indicator */}
      {loginPhase === 'in_world' && (
        <div className="absolute top-4 right-4 pointer-events-none">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm ${
            isConnected
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
                Reconectando...
              </>
            )}
          </div>
        </div>
      )}

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