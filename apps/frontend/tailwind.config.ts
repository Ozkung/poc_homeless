import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#7c6af7', dark: '#4a3fd4', light: '#9d8fff' },
        success: { DEFAULT: '#2dd4a0', dark: '#1aab7c' },
        warning: { DEFAULT: '#f5a623' },
        danger: { DEFAULT: '#f55c5c' },
      },
      fontFamily: {
        sans: ['Sarabun', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
