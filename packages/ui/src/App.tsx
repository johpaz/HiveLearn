import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useLocation, Outlet } from "react-router-dom";
import { Navbar, Footer, LandingLayout, AppLayout, LearningLayout } from "@/components";

// Lazy load pages con named exports
const LandingPage = lazy(() => import("@/pages/LandingPage").then(m => ({ default: m.LandingPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const HowToUsePage = lazy(() => import("@/pages/HowToUsePage").then(m => ({ default: m.HowToUsePage })));
const ProviderSelectScreen = lazy(() => import("@/pages/HiveLearnConfigPage").then(m => ({ default: m.HiveLearnConfigPage })));
const SessionsListScreen = lazy(() => import("@/pages/HiveLearnSessionsPage").then(m => ({ default: m.HiveLearnSessionsPage })));
const HiveLearnSwarmPage = lazy(() => import("@/pages/HiveLearnSwarmPage").then(m => ({ default: m.HiveLearnSwarmPage })));
const ChatOnboardingScreen = lazy(() => import("@/pages/ChatOnboardingScreen").then(m => ({ default: m.ChatOnboardingScreen })));
const A2UILessonScreen = lazy(() => import("@/pages/A2UILessonScreen").then(m => ({ default: m.A2UILessonScreen })));
const LoadingScreen = lazy(() => import("@/pages/LoadingScreen").then(m => ({ default: m.LoadingScreen })));
const EvaluationScreen = lazy(() => import("@/pages/EvaluationScreen").then(m => ({ default: m.EvaluationScreen })));
const ResultScreen = lazy(() => import("@/pages/ResultScreen").then(m => ({ default: m.ResultScreen })));
const GamePlayScreen = lazy(() => import("@/pages/GamePlayScreen").then(m => ({ default: m.GamePlayScreen })));

const queryClient = new QueryClient();

// Wrapper para LandingPage con navegación
function LandingPageWrapper() {
  const navigate = useNavigate();

  return (
    <LandingPage
      onStart={() => navigate('/sessions')}
      onSessions={() => navigate('/sessions')}
      onHowToUse={() => navigate('/how-to-use')}
    />
  );
}

// Wrapper para DashboardPage con navegación
function DashboardPageWrapper() {
  const navigate = useNavigate();
  return <DashboardPage onNavigate={(page: string) => navigate(page)} />;
}

// Wrapper para HowToUsePage con navegación
function HowToUsePageWrapper() {
  const navigate = useNavigate();
  return (
    <HowToUsePage
      onBack={() => navigate(-1)}
      onStart={() => navigate('/sessions')}
    />
  );
}


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-background">
              <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">🐝</div>
                <p className="text-hive-amber font-bold text-lg">Cargando HiveLearn...</p>
              </div>
            </div>
          }>
            <Routes>
              {/* Layout para Marketing/Landing */}
              <Route element={<LandingLayout><Outlet /></LandingLayout>}>
                <Route path="/" element={<LandingPageWrapper />} />
                <Route path="/how-to-use" element={<HowToUsePageWrapper />} />
              </Route>

              {/* Layout para la Aplicación (Dashboard, Sesiones, Config) */}
              <Route element={<AppLayout><Outlet /></AppLayout>}>
                <Route path="/dashboard" element={<DashboardPageWrapper />} />
                <Route path="/sessions" element={<SessionsListScreen />} />
                <Route path="/config" element={<ProviderSelectScreen />} />
                <Route path="/swarm" element={<HiveLearnSwarmPage />} />
              </Route>

              {/* Layout para el Módulo de Aprendizaje (Enfoque) */}
              <Route element={<LearningLayout><Outlet /></LearningLayout>}>
                <Route path="/onboarding"  element={<ChatOnboardingScreen />} />
                <Route path="/generation"  element={<LoadingScreen />} />
                <Route path="/program"     element={<A2UILessonScreen />} />
                <Route path="/evaluation"  element={<EvaluationScreen />} />
                <Route path="/result"      element={<ResultScreen />} />
                {/* Redirects de compatibilidad */}
                <Route path="/loading"     element={<Navigate to="/generation" replace />} />
                <Route path="/lesson"      element={<Navigate to="/program"    replace />} />
              </Route>

              {/* Juego de plataformas (pantalla completa, sin layout) */}
              <Route path="/play" element={<GamePlayScreen />} />
              <Route path="/play/:sessionId" element={<GamePlayScreen />} />

              {/* 404 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          <Toaster />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
