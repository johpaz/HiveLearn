import React, { useState, useEffect } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'

export function RioTitleScreen() {
  const setLoginPhase = useRioMundoStore(s => s.setLoginPhase)
  const [loading, setLoading] = useState(false)
  const [dots, setDots] = useState('')

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [loading])

  const handleIngresar = () => {
    setLoading(true)
    setTimeout(() => {
      setLoginPhase('nickname_input')
    }, 800)
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0e27]">
      {/* Hexagon logo */}
      <svg width="120" height="120" viewBox="0 0 120 120" className="mb-8 animate-pulse">
        <polygon
          points="60,5 110,30 110,90 60,115 10,90 10,30"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
        />
        <polygon
          points="60,15 100,35 100,85 60,105 20,85 20,35"
          fill="#fbbf24"
          fillOpacity="0.1"
          stroke="#fbbf24"
          strokeWidth="1"
        />
        <text x="60" y="55" textAnchor="middle" fill="#fbbf24" fontSize="28" fontWeight="bold">
          H
        </text>
        <text x="60" y="80" textAnchor="middle" fill="#fbbf2480" fontSize="10">
          LEARN
        </text>
      </svg>

      {/* Title */}
      <h1 className="text-4xl font-bold text-[#fbbf24] mb-2 tracking-wider">
        HiveLearn
      </h1>
      <p className="text-[#888] text-sm mb-12">
        Aprende con el enjambre
      </p>

      {/* Enter button */}
      <button
        onClick={handleIngresar}
        disabled={loading}
        className="px-8 py-3 bg-[#fbbf24]/20 border border-[#fbbf24]/50 rounded-xl
                   text-[#fbbf24] font-semibold text-lg transition-all
                   hover:bg-[#fbbf24]/30 hover:border-[#fbbf24] hover:scale-105
                   disabled:opacity-60 disabled:cursor-wait"
      >
        {loading ? `Cargando${dots}` : 'Ingresar'}
      </button>
    </div>
  )
}
