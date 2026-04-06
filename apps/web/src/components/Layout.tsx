import { Outlet, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Sun, Moon, LayoutList, Plus, Trophy, Settings, Rss } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useTheme } from '../hooks/useTheme';
import { NotificationBell } from './NotificationBell';

const themeIcons: Record<string, { icon: typeof Monitor; rotate: number }> = {
  system: { icon: Monitor, rotate: 0 },
  light: { icon: Sun, rotate: 120 },
  dark: { icon: Moon, rotate: 240 },
};

const themeLabels: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function Layout() {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const idx = order.indexOf(theme as 'system' | 'light' | 'dark');
    setTheme(order[(idx + 1) % order.length]);
  };

  // Determine the icon for the current theme
  const currentThemeKey = theme === 'system' ? 'system' : resolvedTheme === 'dark' ? 'dark' : 'light';
  // Use theme (not resolvedTheme) for rotation so it changes on every cycle click
  const iconRotation = themeIcons[theme]?.rotate ?? 0;
  const ThemeIconComponent = themeIcons[currentThemeKey]?.icon ?? Monitor;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="bg-cricket-gold/10 border-b border-cricket-gold/20 text-cricket-gold text-center text-xs font-semibold py-2 px-4">
              <span className="inline-flex items-center gap-2">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-cricket-gold"
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                Offline — scoring data will sync when reconnected
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.header
        className="sticky top-0 z-50 bg-[var(--header-bg)] backdrop-blur-[20px] backdrop-saturate-[180%] header-gradient-line"
        initial={{ y: -56, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 min-h-0 min-w-0 group">
            <div className="w-9 h-9 bg-gradient-to-br from-cricket-green to-emerald-600 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-sm group-hover:shadow-[0_0_20px_rgba(22,163,74,0.3),0_0_8px_rgba(22,163,74,0.2)] transition-all duration-300 group-hover:scale-105">
              CS
            </div>
            <span className="font-bold text-base hidden mobile-l:inline tracking-tight">
              Cric<span className="text-cricket-green">Score</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <nav className="flex items-center gap-0.5">
              <NavLink to="/" active={location.pathname === '/'} icon={<LayoutList size={16} />}>
                Matches
              </NavLink>
              <NavLink to="/tournaments" active={location.pathname.startsWith('/tournaments')} icon={<Trophy size={16} />}>
                Tournaments
              </NavLink>
              <NavLink to="/feed" active={location.pathname === '/feed'} icon={<Rss size={16} />}>
                Feed
              </NavLink>
              <NavLink to="/matches/new" active={location.pathname === '/matches/new'} accent icon={<Plus size={16} />}>
                New
              </NavLink>
            </nav>

            <NotificationBell />

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                to="/settings"
                className="flex items-center justify-center w-9 h-9 min-h-0 min-w-0 rounded-xl transition-colors duration-200 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} />
              </Link>
            </motion.div>

            <motion.button
              onClick={cycleTheme}
              className="ml-1 flex items-center justify-center w-9 h-9 min-h-0 min-w-0 rounded-xl transition-colors duration-200 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              whileTap={{ scale: 0.9 }}
              title={`Theme: ${themeLabels[theme]}`}
              aria-label={`Switch theme (currently ${themeLabels[theme]})`}
            >
              <motion.div
                animate={{ rotate: iconRotation }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex items-center justify-center"
              >
                <ThemeIconComponent size={16} />
              </motion.div>
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="flex-1 max-w-[1280px] mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] py-4 mt-auto">
        <div className="max-w-[1280px] mx-auto px-4 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-medium">CricScore</span>
          <span>Ball-by-ball cricket scoring</span>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  to,
  active,
  accent,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  accent?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const baseClasses =
    'px-3.5 py-2 rounded-xl text-sm font-medium transition-colors duration-200 min-h-[44px] flex items-center gap-1.5';

  const stateClasses = active
    ? accent
      ? 'bg-cricket-green/15 text-cricket-green'
      : 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
    : 'text-[var(--nav-text)] hover:text-[var(--nav-hover-text)] hover:bg-[var(--nav-hover-bg)]';

  return (
    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
      <Link to={to} className={`${baseClasses} ${stateClasses}`}>
        {icon}
        {children}
      </Link>
    </motion.div>
  );
}
