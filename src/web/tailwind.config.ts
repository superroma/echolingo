import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF6EE',
        ink: '#1A1A1A',
        'ink-muted': '#6B7280',
        'ink-faint': '#B5B0A5',
        aegean: '#1E5F8B',
        'aegean-50': '#E6EEF5',
        terracotta: '#C8623F',
        surface: '#FFFFFF',
        hairline: '#E8E2D6',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Source Serif 4', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
