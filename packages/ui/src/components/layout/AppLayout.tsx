import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { useNavigate, useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = location.pathname.substring(1).split('/')[0] || 'dashboard';

  return (
    <div className="flex flex-col min-h-screen bg-background hive-hex-pattern selection:bg-hive-amber/30 selection:text-hive-amber">
      <Navbar 
        onNavigate={(page) => navigate(page === 'landing' ? '/' : `/${page}`)} 
        currentPage={currentPage} 
      />

      <div className="flex flex-1 pt-20">
        {/* Aquí se podría añadir una Sidebar en el futuro */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
