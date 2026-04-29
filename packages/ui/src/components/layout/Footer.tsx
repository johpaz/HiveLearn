export function Footer() {
  return (
    <footer className="bg-hive-card/30 border-t border-white/5 py-12 mt-auto backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🐝</span>
              <span className="text-lg font-bold text-hive-amber">HiveLearn</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Plataforma de aprendizaje adaptativo con IA. 16 agentes especializados trabajando para tu educación.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Enlaces</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-hive-amber transition-colors">Inicio</a></li>
              <li><a href="#" className="hover:text-hive-amber transition-colors">Dashboard</a></li>
              <li><a href="#" className="hover:text-hive-amber transition-colors">Sesiones</a></li>
              <li><a href="#" className="hover:text-hive-amber transition-colors">Cómo usar</a></li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Información</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>Hecho con ❤️ para el aprendizaje adaptativo</li>
              <li>© 2024 HiveLearn</li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Sistema operativo
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-gray-500">
          HiveLearn — Tu colmena de aprendizaje con IA
        </div>
      </div>
    </footer>
  )
}
