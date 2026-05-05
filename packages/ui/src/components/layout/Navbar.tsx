import { useState, useEffect } from 'react'
import {
  Settings2,
  Globe,
  Menu,
  X,
  Home,
  Layers,
  HelpCircle,
} from 'lucide-react'
import { useRioMundoStore } from '@/store/rioMundoStore'

interface NavbarProps {
  onNavigate: (page: string) => void
  currentPage: string
}

export function Navbar({ onNavigate, currentPage }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { id: 'landing', label: 'Inicio', icon: Home, shortLabel: 'Inicio' },
    { id: 'sessions', label: 'Sesiones', icon: Layers, shortLabel: 'Sesiones' },
    { id: 'how-to-use', label: 'Cómo usar', icon: HelpCircle, shortLabel: 'Ayuda' },
  ]

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
          scrolled || mobileMenuOpen
            ? 'bg-zinc-950/90 backdrop-blur-2xl border-white/[0.08] py-2'
            : 'bg-transparent border-transparent py-3'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-11">
            {/* ── Left: all nav items (desktop) ── */}
            <div className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
              {navItems.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={currentPage === item.id}
                  onClick={() => onNavigate(item.id)}
                />
              ))}
            </div>

            {/* ── Center: logo ── */}
            <div className="flex items-center md:absolute md:left-1/2 md:-translate-x-1/2">
              <button
                onClick={() => onNavigate('landing')}
                className="flex items-center gap-2 sm:gap-3 cursor-pointer group"
              >
                <span className="text-2xl sm:text-3xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12">
                  🐝
                </span>
                <span className="text-lg sm:text-xl font-black tracking-tighter text-white group-hover:text-hive-amber transition-colors duration-300">
                  HIVE<span className="text-hive-amber group-hover:text-white">LEARN</span>
                </span>
              </button>
            </div>

            {/* ── Right: actions only (desktop) ── */}
            <div className="hidden md:flex items-center justify-end gap-2 flex-1 min-w-0">
              <ConnectionIndicator />
              <IconButton
                icon={<Settings2 className="h-4 w-4" />}
                onClick={() => onNavigate('config')}
                title="Configurar"
              />

              <button
                onClick={() => onNavigate('rio')}
                className="hive-btn--primary px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest"
              >
                <Globe className="h-4 w-4" />
                <span className="hidden lg:inline">Entrar al Río</span>
                <span className="lg:hidden">Río</span>
              </button>
            </div>

            {/* ── Mobile: right actions ── */}
            <div className="flex md:hidden items-center gap-2">
              <button
                className="p-2 text-white/40 hover:text-white transition-colors rounded-lg"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile full-screen overlay ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <div
        className={`fixed top-[52px] left-0 right-0 z-40 md:hidden transition-all duration-300 ${
          mobileMenuOpen
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-3 mt-2 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id)
                  setMobileMenuOpen(false)
                }}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all ${
                  currentPage === item.id
                    ? 'text-hive-amber bg-hive-amber/10 border border-hive-amber/20'
                    : 'text-white/50 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${currentPage === item.id ? 'text-hive-amber' : 'text-white/20'}`} />
                {item.label}
              </button>
            ))}
          </div>

          <div className="border-t border-white/5 p-3 space-y-2">
            <button
              onClick={() => { onNavigate('config'); setMobileMenuOpen(false); }}
              className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-white/60 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"
            >
              <Settings2 className="h-4 w-4" />
              Configuración
            </button>
            <button
              onClick={() => { onNavigate('rio'); setMobileMenuOpen(false); }}
              className="hive-btn--primary w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest"
            >
              <Globe className="h-4 w-4" />
              Entrar al Río
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Sub-components ── */

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { id: string; label: string; shortLabel: string; icon: React.ElementType }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative px-3 lg:px-4 py-2 rounded-xl text-[10px] lg:text-xs font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
        active ? 'text-hive-amber' : 'text-white/40 hover:text-white/90'
      }`}
    >
      <span className="relative z-10 hidden lg:inline">{item.label}</span>
      <span className="relative z-10 lg:hidden">{item.shortLabel}</span>
      {active && (
        <span className="absolute inset-0 bg-hive-amber/10 rounded-xl border border-hive-amber/20 shadow-amber-glow animate-in fade-in zoom-in-95 duration-500" />
      )}
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-px bg-hive-amber transition-all duration-300 group-hover:w-1/2" />
    </button>
  )
}

function ConnectionIndicator() {
  const isConnected = useRioMundoStore(s => s.wsStatus === 'connected')

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
        isConnected
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : 'bg-red-500/10 border-red-500/30 text-red-400'
      }`}
      title={isConnected ? 'Conectado al servidor' : 'Reconectando...'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400 animate-pulse'
        }`}
      />
      <span className="hidden lg:inline">{isConnected ? 'Conectado' : 'Offline'}</span>
    </div>
  )
}

function IconButton({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-hive-amber hover:border-hive-amber/30 hover:bg-hive-amber/5 transition-all duration-300"
    >
      {icon}
    </button>
  )
}
