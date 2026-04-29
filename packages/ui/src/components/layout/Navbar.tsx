import { useState } from 'react'
import { Button } from '../ui/button'

interface NavbarProps {
  onNavigate: (page: string) => void
  currentPage: string
}

export function Navbar({ onNavigate, currentPage }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { id: 'landing', label: 'Inicio' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'sessions', label: 'Sesiones' },
    { id: 'how-to-use', label: 'Cómo usar' },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => onNavigate('landing')}
          >
            <span className="text-3xl">🐝</span>
            <span className="text-xl font-bold text-hive-amber">HiveLearn</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentPage === item.id
                    ? 'text-hive-amber bg-hive-amber/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('config')}
            >
              Configurar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => onNavigate('sessions')}
              className="bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-honey"
            >

              Nueva Sesión
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/10">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id)
                  setMobileMenuOpen(false)
                }}
                className={`block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  currentPage === item.id
                    ? 'text-hive-amber bg-hive-amber/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="mt-4 px-4 flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={() => onNavigate('config')}>
                Configurar
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => onNavigate('sessions')}
                className="bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-honey"
              >
                Nueva Sesión
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
