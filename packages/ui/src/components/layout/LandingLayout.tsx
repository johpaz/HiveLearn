import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { useNavigate, useLocation } from 'react-router-dom';

interface LandingLayoutProps {
  children: React.ReactNode;
}

export function LandingLayout({ children }: LandingLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = location.pathname === '/' ? 'landing' : location.pathname.substring(1);

  return (
    <div className="flex flex-col min-h-screen bg-background hivelearn-gradient-bg hive-hex-pattern selection:bg-hive-amber/30 selection:text-hive-amber">
      <Navbar 
        onNavigate={(page) => navigate(page === 'landing' ? '/' : `/${page}`)} 
        currentPage={currentPage} 
      />

      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
}
