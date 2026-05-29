import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        surface: 'var(--paper-2)',
        'paper-3': 'var(--paper-3)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        // legacy aliases kept so untouched code compiles:
        'ink-muted': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-mute)',
        line: 'var(--line)',
        hairline: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        aegean: 'var(--aegean)',
        'aegean-50': 'var(--aegean-tint)',
        'aegean-tint': 'var(--aegean-tint)',
        terracotta: 'var(--accent)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Literata', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
