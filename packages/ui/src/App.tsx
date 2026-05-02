import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Navbar, Footer, LandingLayout, AppLayout, LearningLayout } from "@/components";

// Lazy load pages con named exports
const LandingPage = lazy(() => import("@/pages/LandingPage").then(m => ({ default: m.LandingPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const HowToUsePage = lazy(() => import("@/pages/HowToUsePage").then(m => ({ default: m.HowToUsePage })));
const ProviderSelectScreen = lazy(() => import("@/pages/HiveLearnConfigPage").then(m => ({ default: m.HiveLearnConfigPage })));
const SessionsListScreen = lazy(() => import("@/pages/SessionsListScreen").then(m => ({ default: m.SessionsListScreen })));
const OnboardWorldPage = lazy(() => import("@/pages/OnboardWorldPage").then(m => ({ default: m.OnboardWorldPage })));
const NuevaSesionWorldPage = lazy(() => import("@/pages/NuevaSesionWorldPage").then(m => ({ default: m.NuevaSesionWorldPage })));
const A2UILessonScreen = lazy(() => import("@/pages/A2UILessonScreen").then(m => ({ default: m.A2UILessonScreen })));
const EvaluationScreen = lazy(() => import("@/pages/EvaluationScreen").then(m => ({ default: m.EvaluationScreen })));
const ResultScreen = lazy(() => import("@/pages/ResultScreen").then(m => ({ default: m.ResultScreen })));
const MundoWorldPage = lazy(() => import("@/pages/MundoWorldPage").then(m => ({ default: m.MundoWorldPage })));
const SwarmWorld = lazy(() => import("@/canvaslearn/swarm").then(m => ({ default: m.SwarmWorld })));

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
              </Route>

              {/* Standalone: SwarmWorld ocupa toda la pantalla sin layout */}
              <Route path="/hivelearn-swarm" element={<SwarmWorld />} />

              {/* Layout para el Módulo de Aprendizaje (Enfoque) */}
              <Route element={<LearningLayout><Outlet /></LearningLayout>}>
                <Route path="/onboarding" element={<OnboardWorldPage />} />
                <Route path="/nueva-sesion" element={<NuevaSesionWorldPage />} />
                <Route path="/lesson" element={<A2UILessonScreen />} />
                <Route path="/mundo" element={<MundoWorldPage />} />
                <Route path="/evaluation" element={<EvaluationScreen />} />
                <Route path="/result" element={<ResultScreen />} />
              </Route>

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
