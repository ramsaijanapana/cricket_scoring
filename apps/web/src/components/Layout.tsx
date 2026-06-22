import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Monitor,
  Sun,
  Moon,
  LayoutList,
  Plus,
  Trophy,
  Settings,
  Rss,
  Star,
  Medal,
  Menu,
  X,
} from 'lucide-react';
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

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Matches',
    icon: LayoutList,
    isActive: (path: string) => path === '/',
  },
  {
    to: '/tournaments',
    label: 'Tournaments',
    icon: Trophy,
    isActive: (path: string) => path.startsWith('/tournaments'),
  },
  {
    to: '/feed',
    label: 'Feed',
    icon: Rss,
    isActive: (path: string) => path === '/feed',
  },
  {
    to: '/fantasy',
    label: 'Fantasy',
    icon: Star,
    isActive: (path: string) => path.startsWith('/fantasy'),
  },
  {
    to: '/records',
    label: 'Records',
    icon: Medal,
    isActive: (path: string) => path.startsWith('/records'),
  },
  {
    to: '/matches/new',
    label: 'New',
    icon: Plus,
    isActive: (path: string) => path === '/matches/new',
    accent: true,
  },
] as const;

export function Layout() {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeDrawerRef = useRef<HTMLButtonElement>(null);

  const cycleTheme = () => {
    const order: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const idx = order.indexOf(theme as 'system' | 'light' | 'dark');
    setTheme(order[(idx + 1) % order.length]);
  };

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Focus trap + Escape to close
  useEffect(() => {
    if (!drawerOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
        hamburgerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => closeDrawerRef.current?.focus());
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawerOpen, closeDrawer]);

  const currentThemeKey = theme === 'system' ? 'system' : resolvedTheme === 'dark' ? 'dark' : 'light';
  const iconRotation = themeIcons[theme]?.rotate ?? 0;
  const ThemeIconComponent = themeIcons[currentThemeKey]?.icon ?? Monitor;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-cricket-green focus:text-white focus:rounded-xl focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>

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
          <div className="flex items-center gap-2 min-w-0">
            <motion.button
              ref={hamburgerRef}
              type="button"
              onClick={openDrawer}
              className="tablet:hidden flex items-center justify-center w-9 h-9 min-h-0 min-w-0 rounded-xl transition-colors duration-200 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              whileTap={{ scale: 0.9 }}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu size={20} />
            </motion.button>

            <Link to="/" className="flex items-center gap-2.5 min-h-0 min-w-0 group">
              <div className="w-9 h-9 bg-gradient-to-br from-cricket-green to-emerald-600 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-sm group-hover:shadow-[0_0_20px_rgba(22,163,74,0.3),0_0_8px_rgba(22,163,74,0.2)] transition-all duration-300 group-hover:scale-105">
                CS
              </div>
              <span className="font-bold text-base hidden mobile-l:inline tracking-tight">
                Cric<span className="text-cricket-green">Score</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <nav className="hidden tablet:flex items-center gap-0.5" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  active={item.isActive(location.pathname)}
                  accent={'accent' in item && item.accent}
                  icon={<item.icon size={16} />}
                >
                  {item.label}
                </NavLink>
              ))}
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

      {/* Mobile navigation drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="tablet:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
              aria-label="Close navigation menu"
              onClick={closeDrawer}
            />

            <motion.nav
              ref={drawerRef}
              id="mobile-nav-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="tablet:hidden fixed top-0 left-0 bottom-0 z-[70] w-[min(280px,85vw)] bg-[var(--header-bg)] backdrop-blur-[20px] backdrop-saturate-[180%] border-r border-[var(--border-subtle)] shadow-xl flex flex-col"
              aria-label="Main"
            >
              <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-subtle)]">
                <span className="font-bold text-base tracking-tight">
                  Cric<span className="text-cricket-green">Score</span>
                </span>
                <motion.button
                  ref={closeDrawerRef}
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    hamburgerRef.current?.focus();
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors duration-200 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  whileTap={{ scale: 0.9 }}
                  aria-label="Close navigation menu"
                >
                  <X size={20} />
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    active={item.isActive(location.pathname)}
                    accent={'accent' in item && item.accent}
                    icon={<item.icon size={18} />}
                    variant="drawer"
                    onNavigate={closeDrawer}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main id="main-content" className="flex-1 max-w-[1280px] mx-auto w-full px-4 py-6">
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
  variant = 'header',
  onNavigate,
}: {
  to: string;
  active: boolean;
  accent?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'header' | 'drawer';
  onNavigate?: () => void;
}) {
  const baseClasses =
    variant === 'drawer'
      ? 'w-full px-4 py-3 rounded-xl text-base font-medium transition-colors duration-200 min-h-[44px] flex items-center gap-3'
      : 'px-3.5 py-2 rounded-xl text-sm font-medium transition-colors duration-200 min-h-[44px] flex items-center gap-1.5';

  const stateClasses = active
    ? accent
      ? 'bg-cricket-green/15 text-cricket-green'
      : 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
    : 'text-[var(--nav-text)] hover:text-[var(--nav-hover-text)] hover:bg-[var(--nav-hover-bg)]';

  return (
    <motion.div whileHover={{ scale: variant === 'header' ? 1.02 : 1.01 }} whileTap={{ scale: 0.98 }}>
      <Link
        to={to}
        className={`${baseClasses} ${stateClasses}`}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        {icon}
        {children}
      </Link>
    </motion.div>
  );
}
