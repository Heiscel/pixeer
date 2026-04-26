import { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MotionSitesBadge from './components/MotionSitesBadge';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';

export type AppPage = 'landing' | 'login' | 'dashboard';

export default function App() {
  const [page, setPage] = useState<AppPage>('landing');

  if (page === 'login') return <LoginPage onNavigate={setPage} />;
  if (page === 'dashboard') return <DashboardPage onNavigate={setPage} />;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Navbar onNavigate={setPage} />
      <Hero onNavigate={setPage} />
      <MotionSitesBadge />
    </div>
  );
}
