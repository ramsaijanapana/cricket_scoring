import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { api, setAuthToken, setRefreshToken, setUserId, parseJwtPayload } from '../lib/api';
import { setSentryUser } from '../lib/sentry';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const response = await api.login({ email: trimmedEmail, password });
      setAuthToken(response.access_token);
      setRefreshToken(response.refresh_token);

      let userId: string | undefined;
      let userEmail: string | undefined;
      let displayName: string | undefined;

      try {
        const profile = await api.getMyProfile();
        userId = profile.id;
        userEmail = profile.email;
        displayName = profile.displayName;
        setUserId(profile.id);
      } catch {
        const payload = parseJwtPayload(response.access_token);
        if (payload) {
          userId = payload.sub;
          userEmail = payload.email;
          setUserId(payload.sub);
        }
      }

      if (userId) {
        setSentryUser({
          id: userId,
          email: userEmail,
          username: displayName,
        });
      }

      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-full max-w-md"
        >
          <div className="hero-gradient rounded-2xl p-8 mb-8 relative overflow-hidden text-center">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.3), transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15), transparent 40%)',
              }}
            />
            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <LogIn size={28} className="text-white" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white mb-1">Sign In</h1>
              <p className="text-white/70 text-sm">
                Sign in to sync your profile and scoring data
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="card gradient-strip-top space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-cricket-red/10 border border-cricket-red/20 text-cricket-red text-sm px-4 py-3"
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                disabled={loading}
              />
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-60"
              whileTap={{ scale: loading ? 1 : 0.98 }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </motion.button>
          </form>

          <p className="text-center text-sm text-theme-tertiary mt-6">
            <Link to="/" className="hover:text-theme-primary transition-colors">
              ← Back to matches
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
