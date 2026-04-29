import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { 
  Settings2, 
  Plus, 
  Menu, 
  X, 
  Home, 
  LayoutDashboard, 
  Layers, 
  HelpCircle 
} from 'lucide-react'

interface NavbarProps {
  onNavigate: (page: string) => void
  currentPage: string
}

export function Navbar({ onNavigate, currentPage }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Manejar el scroll para efectos de transparencia
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { id: 'landing', label: 'Inicio', icon: Home },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sessions', label: 'Sesiones', icon: Layers },
    { id: 'how-to-use', label: 'Cómo usar', icon: HelpCircle },
  ]

  const leftNavItems = navItems.slice(0, 2)
  const rightNavItems = navItems.slice(2)

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b ${
        scrolled 
          ? 'bg-zinc-950/70 backdrop-blur-2xl border-white/[0.08] py-2' 
          : 'bg-transparent border-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-12">
          
          {/* Desktop Left Navigation */}
          <div className="hidden md:flex items-center gap-1 flex-1">
            {leftNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group relative px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
                  currentPage === item.id
                    ? 'text-hive-amber'
                    : 'text-white/40 hover:text-white/90'
                }`}
              >
                <span className="relative z-10">{item.label}</span>
                {currentPage === item.id && (
                  <span className="absolute inset-0 bg-hive-amber/10 rounded-xl border border-hive-amber/20 shadow-amber-glow animate-in fade-in zoom-in-95 duration-500" />
                )}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-px bg-hive-amber transition-all duration-300 group-hover:w-1/2" />
              </button>
            ))}
          </div>

          {/* Logo (Centered) */}
          <div 
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 cursor-pointer group"
            onClick={() => onNavigate('landing')}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-hive-amber/20 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="text-3xl relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12">🐝</span>
            </div>
            <span className="text-xl font-black tracking-tighter text-white group-hover:text-hive-amber transition-colors duration-300">
              HIVE<span className="text-hive-amber group-hover:text-white">LEARN</span>
            </span>
          </div>

          {/* Desktop Right Navigation & Actions */}
          <div className="hidden md:flex items-center justify-end gap-4 flex-1">
            <div className="flex items-center gap-1 mr-2">
              {rightNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`group relative px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
                    currentPage === item.id
                      ? 'text-hive-amber'
                      : 'text-white/40 hover:text-white/90'
                  }`}
                >
                  <span className="relative z-10">{item.label}</span>
                  {currentPage === item.id && (
                    <span className="absolute inset-0 bg-hive-amber/10 rounded-xl border border-hive-amber/20 shadow-amber-glow animate-in fade-in zoom-in-95 duration-500" />
                  )}
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-px bg-hive-amber transition-all duration-300 group-hover:w-1/2" />
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />

            <button
              onClick={() => onNavigate('config')}
              className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-hive-amber hover:border-hive-amber/30 hover:bg-hive-amber/5 transition-all duration-300"
              title="Configurar"
            >
              <Settings2 className="h-4 w-4" />
            </button>

            <button
              onClick={() => onNavigate('sessions')}
              className="hive-btn--primary px-5 py-2 rounded-xl flex items-center gap-2 group overflow-hidden relative"
            >
              <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <Plus className="h-4 w-4 relative z-10" />
              <span className="relative z-10">Nueva Sesión</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-white/40 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-6 animate-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 gap-2 mb-6">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all ${
                    currentPage === item.id
                      ? 'text-hive-amber bg-hive-amber/10 border border-hive-amber/20'
                      : 'text-white/40 hover:text-white/90 hover:bg-white/5'
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${currentPage === item.id ? 'text-hive-amber' : 'text-white/20'}`} />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { onNavigate('config'); setMobileMenuOpen(false); }}
                className="w-full py-3 rounded-2xl border border-white/10 bg-white/5 text-white/60 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"
              >
                <Settings2 className="h-4 w-4" />
                Configuración
              </button>
              <button 
                onClick={() => { onNavigate('sessions'); setMobileMenuOpen(false); }}
                className="hive-btn--primary w-full py-4 rounded-2xl flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Nueva Sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
