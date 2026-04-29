import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface DashboardPageProps {
  onNavigate: (page: string) => void
}

interface Session {
  sessionId: string
  tema: string
  completada: boolean
  xpGanado: number
  fecha: string
}

interface Stats {
  totalSesiones: number
  sesionesCompletadas: number
  xpTotal: number
  nivelActual: string
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [stats, setStats] = useState<Stats>({
    totalSesiones: 0,
    sesionesCompletadas: 0,
    xpTotal: 0,
    nivelActual: 'Aprendiz',
  })
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cargar datos del dashboard
    const loadDashboard = async () => {
      try {
        // Aquí iría la llamada real a la API
        // Por ahora usamos datos mock
        setStats({
          totalSesiones: 5,
          sesionesCompletadas: 3,
          xpTotal: 450,
          nivelActual: 'Intermedio',
        })
        setRecentSessions([
          { sessionId: '1', tema: 'JavaScript básico', completada: true, xpGanado: 100, fecha: '2024-04-28' },
          { sessionId: '2', tema: 'Python desde cero', completada: true, xpGanado: 150, fecha: '2024-04-27' },
          { sessionId: '3', tema: 'HTML y CSS', completada: false, xpGanado: 50, fecha: '2024-04-26' },
        ])
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  const nivelProgress = (stats.xpTotal % 500) / 500 * 100

  return (
    <div className="min-h-screen hivelearn-gradient-bg hive-hex-pattern pt-20 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-black tracking-[0.3em] text-amber-500 uppercase">Panel de Control</span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-foreground uppercase">
              Dashboard
            </h1>
            <p className="text-muted-foreground font-light text-sm mt-1">
              Resumen de tu actividad y progreso
            </p>
          </div>
          <Button
            variant="default"
            onClick={() => onNavigate('sessions')}
            className="font-bold shadow-amber-glow active:scale-95"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ffc174)', color: '#2a1700' }}
          >
            🚀 Nueva Sesión
          </Button>

        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Total Sesiones</p>
                <p className="text-4xl font-black text-foreground">{stats.totalSesiones}</p>
              </div>
              <div className="text-4xl opacity-60">📚</div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Completadas</p>
                <p className="text-4xl font-black text-hive-green">{stats.sesionesCompletadas}</p>
              </div>
              <div className="text-4xl opacity-60">✅</div>
            </div>
          </div>

          <div className="glass-card p-6 glow-amber-active">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">XP Total</p>
                <p className="text-4xl font-black text-amber-400">{stats.xpTotal}</p>
              </div>
              <div className="text-4xl opacity-60">🏆</div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Nivel</p>
                <p className="text-xl font-black text-foreground">{stats.nivelActual}</p>
                <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden w-32">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${nivelProgress}%`, background: 'linear-gradient(90deg, #f59e0b, #ffc174)' }}
                  />
                </div>

              </div>
              <div className="text-4xl opacity-60">⭐</div>
            </div>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sesiones Recientes</CardTitle>
              <CardDescription>Tu actividad de las últimas sesiones</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-400">
                  Cargando...
                </div>
              ) : recentSessions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">📚</div>
                  <p className="text-gray-400 mb-4">No tienes sesiones aún</p>
                  <Button variant="default" onClick={() => onNavigate('sessions')} className="bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-honey">
                    Crear Primera Sesión
                  </Button>

                </div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          session.completada ? 'bg-hive-green' : 'bg-hive-amber'
                        }`} />
                        <div>
                          <p className="font-medium text-foreground">{session.tema}</p>
                          <p className="text-xs text-muted-foreground">{session.fecha}</p>
                        </div>
                      </div>
                      <div className="text-sm text-hive-amber font-medium">
                        +{session.xpGanado} XP
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones Rápidas</CardTitle>
              <CardDescription>Atajos para comenzar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="default"
                className="w-full justify-start bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-honey"
                onClick={() => onNavigate('sessions')}
              >
                🚀 Crear Nueva Sesión
              </Button>

              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => onNavigate('onboarding')}
              >
                🐝 Iniciar Onboarding
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => onNavigate('config')}
              >
                ⚙️ Configurar Proveedor
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => onNavigate('how-to-use')}
              >
                ❓ ¿Cómo Usar?
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Explora HiveLearn</CardTitle>
              <CardDescription>Descubre todas las funcionalidades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => onNavigate('sessions')}
                  className="p-4 rounded-xl bg-accent/30 border border-border hover:border-hive-amber/50 transition-all text-left group"
                >
                  <div className="text-3xl mb-2">📚</div>
                  <h4 className="font-bold text-foreground mb-1 group-hover:text-hive-amber transition-colors">Sesiones</h4>
                  <p className="text-sm text-muted-foreground">
                    Gestiona y crea tus sesiones de aprendizaje
                  </p>
                </button>


                <button
                  onClick={() => onNavigate('how-to-use')}
                  className="p-4 rounded-xl bg-accent/30 border border-border hover:border-hive-amber/50 transition-all text-left group"
                >
                  <div className="text-3xl mb-2">📖</div>
                  <h4 className="font-bold text-foreground mb-1 group-hover:text-hive-amber transition-colors">Tutorial</h4>
                  <p className="text-sm text-muted-foreground">
                    Aprende a usar todas las funciones
                  </p>
                </button>


                <button
                  onClick={() => onNavigate('config')}
                  className="p-4 rounded-xl bg-accent/30 border border-border hover:border-hive-amber/50 transition-all text-left group"
                >
                  <div className="text-3xl mb-2">⚙️</div>
                  <h4 className="font-bold text-foreground mb-1 group-hover:text-hive-amber transition-colors">Configuración</h4>
                  <p className="text-sm text-muted-foreground">
                    Configura proveedores y preferencias
                  </p>
                </button>

              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
