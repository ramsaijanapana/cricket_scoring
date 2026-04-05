import { Outlet, Link, useLocation } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function Layout() {
  const location = useLocation();
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen bg-surface-900 text-surface-50 flex flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-cricket-gold/90 text-surface-900 text-center text-sm font-semibold py-1.5 px-4">
          Offline — scoring data will sync when connection is restored
        </div>
      )}

      {/* Header */}
      <header className="bg-surface-800 border-b border-surface-700 sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 min-h-0 min-w-0">
            <div className="w-8 h-8 bg-cricket-green rounded-lg flex items-center justify-center font-bold text-sm">
              CS
            </div>
            <span className="font-bold text-lg hidden mobile-l:inline">CricScore</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" active={location.pathname === '/'}>
              Matches
            </NavLink>
            <NavLink to="/matches/new" active={location.pathname === '/matches/new'}>
              + New
            </NavLink>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1280px] mx-auto w-full px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] flex items-center ${
        active
          ? 'bg-cricket-green/15 text-cricket-green'
          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'
      }`}
    >
      {children}
    </Link>
  );
}
