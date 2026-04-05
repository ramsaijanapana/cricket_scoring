/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // context.md design tokens
        cricket: {
          green: '#1A7C3E',
          gold: '#C8991A',
          red: '#B22222',
          blue: '#1A4D7C',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['"SF Pro"', 'Roboto', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      screens: {
        'mobile-s': '320px',
        'mobile-l': '360px',
        'tablet': '768px',
        'desktop': '1024px',
        'wide': '1280px',
      },
    },
  },
  plugins: [],
};
