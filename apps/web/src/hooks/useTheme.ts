import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('cricscore-theme') as Theme;
    return saved || 'system';
  });

  const resolvedTheme = useResolvedTheme(theme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('cricscore-theme', t);
  }, []);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);

    // Update theme-color meta tag for mobile browser chrome
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff');
    }
  }, [resolvedTheme]);

  return { theme, resolvedTheme, setTheme };
}

function useResolvedTheme(theme: Theme): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return theme === 'system' ? systemTheme : theme;
}
