import React, { useState, useCallback } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { RIO_NIVELES } from '../types'

export function RioHUD() {
  const {
    nickname,
    xpTotal,
    nivelActual,
    progresoNivel,
    vidas,
    racha,
    mejorRacha,
    tributaries,
    zonaActual,
    beeState,
    dialogBubbles,
  } = useRioMundoStore()

  const nivelInfo = RIO_NIVELES.find(n => n.nivel === nivelActual) || RIO_NIVELES[0]
  const completedZones = tributaries.filter(t => t.estado === 'completado').length
  const totalZones = tributaries.length

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
        {/* Left: Level & XP */}
        <div className="bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{nivelInfo.badge}</span>
            <div>
              <div className="text-[#fbbf24] font-bold text-sm">{nivelInfo.nombre} {nivelActual}</div>
              <div className="w-32 h-2 bg-[#1a1f3a] rounded-full mt-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]"
                  style={{ width: `${progresoNivel}%` }}
                />
              </div>
              <div className="text-[#888] text-xs mt-0.5">{xpTotal} XP</div>
            </div>
          </div>
        </div>

        {/* Right: Lives & Streak */}
        <div className="bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={`text-lg ${i < vidas ? 'opacity-100' : 'opacity-30'}`}>
                  ❤️
                </span>
              ))}
            </div>
            {racha > 0 && (
              <div className="text-[#fbbf24] font-bold text-sm">
                🔥 {racha}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone progress */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="text-[#fbbf24] font-bold text-sm">🌍 {completedZones}/{totalZones}</span>
          <span className="text-[#888] text-xs">zonas completadas</span>
        </div>
      </div>

      {/* Mini-map placeholder */}
      <div className="absolute bottom-4 right-4 w-32 h-32 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 pointer-events-auto">
        <div className="flex items-center justify-center h-full text-[#888] text-xs">
          🗺️ Mini-mapa
        </div>
      </div>
    </div>
  )
}