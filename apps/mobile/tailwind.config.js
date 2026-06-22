const { cricketPreset } = require('@cricket/ui/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset"), cricketPreset],
  plugins: [],
};
