/**
 * GamificationOverlay — UI de gamificación en React
 * 
 * Muestra XP, nivel, vidas, racha, logros y mini mapa sobre el canvas de PixiJS
 */

import React, { useEffect, useState } from 'react'
import { NIVELES_CONFIG, COLORS } from '../constants'
import type { MundoLogro } from '@hivelearn/core'

export interface GamificationOverlayProps {
  /** XP total acumulada */
  xpTotal: number
  
  /** Nivel actual */
  nivelActual: number
  
  /** Progreso al siguiente nivel (0-100) */
  progresoNivel: number
  
  /** Vidas restantes */
  vidas: number
  
  /** Racha actual */
  racha: number
  
  /** Logros desbloqueados */
  logros: MundoLogro['datos'][]
  
  /** Zona actual */
  zonaActual: number
  
  /** Nickname del alumno */
  nickname: string
  
  /** Tema del programa */
  tema: string
  
  /** Mostrar mini mapa */
  showMiniMap?: boolean
  
  /** Mostrar notificación de nivel up */
  showLevelUp?: boolean
  
  /** Logro activo para mostrar */
  logroActivo?: MundoLogro['datos'] | null
}

/**
 * GamificationOverlay — Overlay de gamificación
 */
export function GamificationOverlay({
  xpTotal,
  nivelActual,
  progresoNivel,
  vidas,
  racha,
  logros,
  zonaActual,
  nickname,
  tema,
  showMiniMap = true,
  showLevelUp = false,
  logroActivo,
}: GamificationOverlayProps) {
  const [showXPAnimation, setShowXPAnimation] = useState(false)
  const [prevXP, setPrevXP] = useState(xpTotal)
  const [prevNivel, setPrevNivel] = useState(nivelActual)

  // Detectar cambios de XP para animación
  useEffect(() => {
    if (xpTotal > prevXP) {
      setShowXPAnimation(true)
      setTimeout(() => setShowXPAnimation(false), 1400)
      setPrevXP(xpTotal)
    }
  }, [xpTotal])

  // Detectar cambio de nivel
  useEffect(() => {
    if (nivelActual > prevNivel) {
      setPrevNivel(nivelActual)
    }
  }, [nivelActual])

  const nivelInfo = NIVELES_CONFIG.find(n => n.nivel === nivelActual) || NIVELES_CONFIG[0]
  const siguienteNivel = NIVELES_CONFIG.find(n => n.nivel === nivelActual + 1)

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* ─── Barra superior ─────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between gap-4">
        
        {/* XP Bar */}
        <div className="flex-1 max-w-2xl space-y-2">
          {/* Nivel y badge */}
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black shadow-lg"
              style={{ 
                background: `#${nivelInfo.color.toString(16).padStart(6, '0')}`,
              }}
            >
              {nivelInfo.badge}
            </div>
            <div>
              <div className="text-white font-bold text-lg drop-shadow-lg">
                {nivelInfo.nombre}
              </div>
              <div className="text-white/70 text-xs">
                Nivel {nivelActual}
              </div>
            </div>
          </div>
          
          {/* Barra de XP */}
          <div className="relative">
            {/* Fondo de barra */}
            <div className="h-4 bg-[#1a1f3a] rounded-full overflow-hidden border border-[#2a3550]">
              {/* Barra de progreso */}
              <div 
                className="h-full transition-all duration-500 ease-out"
                style={{ 
                  width: `${progresoNivel}%`,
                  background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
                }}
              />
            </div>
            
            {/* Texto de XP */}
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-white/70 font-medium">
                {xpTotal} XP
              </span>
              {siguienteNivel && (
                <span className="text-xs text-white/70 font-medium">
                  {siguienteNivel.xp - xpTotal} XP para {siguienteNivel.nombre}
                </span>
              )}
            </div>
            
            {/* Animación de XP ganada */}
            {showXPAnimation && (
              <div className="absolute -top-8 right-0 text-[#fbbf24] font-bold text-lg animate-bounce">
                +{xpTotal - prevXP} XP 🔥
              </div>
            )}
          </div>
        </div>

        {/* Vidas y Racha */}
        <div className="flex items-center gap-4">
          {/* Vidas */}
          <div className="flex items-center gap-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 transition-all ${
                  i < vidas ? 'scale-100' : 'scale-75 opacity-30'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-full h-full">
                  <path
                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                    fill={i < vidas ? '#ec4899' : '#4a1a1a'}
                    stroke={i < vidas ? '#ffffff' : '#8b0000'}
                    strokeWidth="1"
                  />
                </svg>
              </div>
            ))}
          </div>

          {/* Racha */}
          {racha > 0 && (
            <div className="flex items-center gap-2 bg-[#1a1f3a] px-3 py-2 rounded-xl border border-[#f97316]/50">
              <span className="text-xl">🔥</span>
              <span className="text-[#f97316] font-bold text-lg">{racha}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Notificación de Nivel Up ──────────────────────────────────────── */}
      {showLevelUp && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-bounce">
            <div className="text-6xl mb-4">🎉</div>
            <div className="text-4xl font-black text-[#fbbf24] drop-shadow-lg mb-2">
              ¡NIVEL {nivelActual}!
            </div>
            <div className="text-xl text-white drop-shadow">
              {nivelInfo.nombre}
            </div>
          </div>
        </div>
      )}

      {/* ─── Notificación de Logro ─────────────────────────────────────────── */}
      {logroActivo && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-[#1a1f3a]/95 backdrop-blur-sm rounded-2xl border-2 border-[#fbbf24] p-6 min-w-[320px] shadow-2xl animate-pulse">
            <div className="flex items-center gap-4">
              {/* Ícono del logro */}
              <div 
                className={`w-20 h-20 rounded-xl flex items-center justify-center text-4xl ${
                  logroActivo.rareza === 'legendario' ? 'bg-[#fbbf24]' :
                  logroActivo.rareza === 'epico' ? 'bg-[#8b5cf6]' :
                  logroActivo.rareza === 'raro' ? 'bg-[#3b82f6]' :
                  'bg-[#22c55e]'
                }`}
              >
                {logroActivo.icono}
              </div>
              
              {/* Info del logro */}
              <div className="flex-1">
                <div className="text-[#fbbf24] text-xs font-bold uppercase tracking-wider mb-1">
                  ¡Logro Desbloqueado!
                </div>
                <div className="text-white font-bold text-lg mb-1">
                  {logroActivo.nombre}
                </div>
                <div className="text-white/70 text-sm mb-2">
                  {logroActivo.descripcion}
                </div>
                <div className="text-[#fbbf24] font-bold text-sm">
                  +{logroActivo.xp_bonus} XP
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mini Mapa (esquina inferior) ──────────────────────────────────── */}
      {showMiniMap && (
        <div className="absolute bottom-4 left-4 w-48 h-32 bg-[#1a1f3a]/90 backdrop-blur-sm rounded-xl border border-[#2a3550] overflow-hidden">
          {/* Header del mini mapa */}
          <div className="absolute top-0 left-0 right-0 px-3 py-2 bg-[#0a0e27]/80">
            <div className="text-white/90 text-xs font-bold truncate">
              {tema}
            </div>
            <div className="text-white/60 text-[10px]">
              Zona {zonaActual}
            </div>
          </div>
          
          {/* Mapa simplificado */}
          <div className="absolute inset-0 top-8 flex items-center justify-center">
            <div className="relative w-full h-full">
              {/* Línea de progreso */}
              <div className="absolute top-1/2 left-4 right-4 h-1 bg-[#2a3550] rounded-full transform -translate-y-1/2">
                <div 
                  className="h-full bg-[#fbbf24] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (zonaActual / 10) * 100)}%` }}
                />
              </div>
              
              {/* Marcador de zona actual */}
              <div 
                className="absolute top-1/2 w-4 h-4 bg-[#fbbf24] rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg transition-all duration-300"
                style={{ left: `${Math.min(90, 4 + (zonaActual / 10) * 86)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Información de zona actual ────────────────────────────────────── */}
      <div className="absolute bottom-4 right-4 bg-[#1a1f3a]/90 backdrop-blur-sm rounded-xl border border-[#2a3550] px-4 py-3">
        <div className="text-white/90 text-sm font-bold mb-1">
          {zonaActual === 0 ? '¡Bienvenido!' : `Zona ${zonaActual}`}
        </div>
        <div className="text-white/60 text-xs">
          {zonaActual === 0 
            ? 'Habla con el Coordinador' 
            : zonaActual >= 10 
              ? '¡Evaluación Final!'
              : 'Completa el módulo para avanzar'
          }
        </div>
      </div>

      {/* ─── Mensaje de bienvenida ─────────────────────────────────────────── */}
      {zonaActual === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-[#1a1f3a]/95 backdrop-blur-sm rounded-2xl border-2 border-[#fbbf24] p-6 max-w-md text-center shadow-2xl">
            <div className="text-4xl mb-3">👋</div>
            <div className="text-[#fbbf24] text-lg font-bold mb-2">
              ¡Hola, {nickname}!
            </div>
            <div className="text-white/90 text-sm mb-4">
              Hoy aprenderás sobre <span className="text-[#fbbf24] font-bold">{tema}</span>
            </div>
            <div className="text-white/70 text-xs">
              Usa ← → para moverte, Espacio para saltar
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GamificationOverlay
