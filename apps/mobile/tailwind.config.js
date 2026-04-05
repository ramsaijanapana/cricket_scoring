/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cricket: {
          green: "#16a34a",
          "green-light": "#22c55e",
          gold: "#eab308",
          red: "#ef4444",
          blue: "#3b82f6",
          purple: "#a855f7",
        },
        surface: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#a3a3a3",
          400: "#737373",
          500: "#525252",
          600: "#404040",
          700: "#262626",
          750: "#1f1f1f",
          800: "#171717",
          850: "#121212",
          900: "#0a0a0a",
        },
      },
    },
  },
  plugins: [],
};
