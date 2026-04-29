import React from 'react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

interface LearningLayoutProps {
  children: React.ReactNode;
  title?: string;
  progress?: number;
}

export function LearningLayout({ children, title, progress }: LearningLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-background hive-hex-pattern selection:bg-hive-amber/30 selection:text-hive-amber">
      {/* Learning Header */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded-lg bg-hive-amber/10 flex items-center justify-center text-xl shadow-honey">
            🐝
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground truncate max-w-[200px] md:max-w-md">
              {title || 'Módulo de Aprendizaje'}
            </h1>
            {progress !== undefined && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-1 w-32 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-hive-amber transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {progress}% completado
                </span>
              </div>
            )}
          </div>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/dashboard')}
          className="text-muted-foreground hover:text-destructive transition-colors gap-2"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </header>

      {/* Content Area */}
      <main className="flex-grow flex flex-col relative">
        <div className="absolute inset-0 hivelearn-gradient-bg opacity-50 pointer-events-none" />
        <div className="relative z-10 flex-grow py-8">
          {children}
        </div>
      </main>
    </div>

  );
}
