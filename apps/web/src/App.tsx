import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from './components/Layout';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const ScoringPage = lazy(() => import('./pages/ScoringPage').then(m => ({ default: m.ScoringPage })));
const ScorecardPage = lazy(() => import('./pages/ScorecardPage').then(m => ({ default: m.ScorecardPage })));
const CreateMatchPage = lazy(() => import('./pages/CreateMatchPage').then(m => ({ default: m.CreateMatchPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const TournamentPage = lazy(() => import('./pages/TournamentPage').then(m => ({ default: m.TournamentPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const FeedPage = lazy(() => import('./pages/FeedPage').then(m => ({ default: m.FeedPage })));
const FantasyPage = lazy(() => import('./pages/FantasyPage').then(m => ({ default: m.FantasyPage })));
const RecordsPage = lazy(() => import('./pages/RecordsPage').then(m => ({ default: m.RecordsPage })));
const OverByOverPage = lazy(() => import('./pages/OverByOverPage').then(m => ({ default: m.OverByOverPage })));

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="24" cy="24" r="20" fill="#ef4444" />
        <circle cx="24" cy="24" r="20" fill="url(#ballGrad)" />
        <path
          d="M12 18c4 6 8 8 12 6s8-6 12-4"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M12 28c4-2 8-4 12-2s8 4 12 2"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        <path d="M14 17l1 2M18 15l0.5 2M22 14l0 2M26 15l-0.5 2M30 17l-1 2" stroke="white" strokeWidth="0.8" opacity="0.6" />
        <path d="M14 29l1-2M18 31l0.5-2M22 32l0-2M26 31l-0.5-2M30 29l-1-2" stroke="white" strokeWidth="0.8" opacity="0.6" />
        <defs>
          <radialGradient id="ballGrad" cx="35%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
          </radialGradient>
        </defs>
      </motion.svg>
    </div>
  );
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<AnimatedPage><HomePage /></AnimatedPage>} />
          <Route path="/matches/new" element={<AnimatedPage><CreateMatchPage /></AnimatedPage>} />
          <Route path="/matches/:id/score" element={<AnimatedPage><ScoringPage /></AnimatedPage>} />
          <Route path="/matches/:id/scorecard" element={<AnimatedPage><ScorecardPage /></AnimatedPage>} />
          <Route path="/matches/:id/analytics" element={<AnimatedPage><AnalyticsPage /></AnimatedPage>} />
          <Route path="/matches/:id/overs" element={<AnimatedPage><OverByOverPage /></AnimatedPage>} />
          <Route path="/tournaments" element={<AnimatedPage><TournamentPage /></AnimatedPage>} />
          <Route path="/tournaments/:id" element={<AnimatedPage><TournamentPage /></AnimatedPage>} />
          <Route path="/feed" element={<AnimatedPage><FeedPage /></AnimatedPage>} />
          <Route path="/fantasy" element={<AnimatedPage><FantasyPage /></AnimatedPage>} />
          <Route path="/records" element={<AnimatedPage><RecordsPage /></AnimatedPage>} />
          <Route path="/settings" element={<AnimatedPage><SettingsPage /></AnimatedPage>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
