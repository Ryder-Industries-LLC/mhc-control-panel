/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        // Core theme colors - now using CSS variables for theme switching
        'mhc-bg': 'var(--mhc-bg)',
        'mhc-surface': 'var(--mhc-surface)',
        'mhc-surface-light': 'var(--mhc-surface-light)',
        'mhc-surface-lighter': 'var(--mhc-surface-lighter)',

        // Primary gradient colors
        'mhc-primary': {
          DEFAULT: 'var(--mhc-primary)',
          dark: 'var(--mhc-primary-dark)',
          light: 'var(--mhc-primary-light)',
        },

        // Text colors
        'mhc-text': {
          DEFAULT: 'var(--mhc-text)',
          muted: 'var(--mhc-text-muted)',
          dim: 'var(--mhc-text-dim)',
        },

        // Semantic colors
        'mhc-success': 'var(--mhc-success)',
        'mhc-success-light': '#68d391',
        'mhc-warning': 'var(--mhc-warning)',
        'mhc-warning-light': '#fbbf24',
        'mhc-danger': 'var(--mhc-danger)',
        'mhc-danger-light': '#fc8181',
        'mhc-info': 'var(--mhc-info)',

        // Role/badge specific colors (static - don't change with theme)
        'mhc-broadcaster': '#8b5cf6',
        'mhc-viewer': '#3b82f6',
        'mhc-tip': '#48bb78',
        'mhc-pm': '#9f7aea',
        'mhc-follow': '#ed8936',
      },

      backgroundImage: {
        // Gradient uses CSS variables for theme switching
        'gradient-primary': 'linear-gradient(135deg, var(--gradient-start) 0%, var(--gradient-end) 100%)',
        'gradient-success': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-warning': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'gradient-live': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      },

      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'sans-serif',
        ],
        mono: ['Monaco', 'Courier New', 'monospace'],
      },

      boxShadow: {
        'mhc-card': '0 4px 6px rgba(0, 0, 0, 0.3)',
        'mhc-hover': '0 8px 12px rgba(102, 126, 234, 0.3)',
        'mhc-glow': '0 0 20px rgba(102, 126, 234, 0.4)',
        'mhc-live': '0 4px 12px rgba(34, 197, 94, 0.4)',
      },

      animation: {
        'pulse-live': 'pulse-live 1.5s ease-in-out infinite',
        'pulse-priority': 'pulse-priority 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-in',
        'pulse-glow': 'pulse-glow 2s infinite',
      },

      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'pulse-priority': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': {
            boxShadow:
              '0 4px 12px rgba(34, 197, 94, 0.4), 0 0 20px rgba(34, 197, 94, 0.3)',
          },
          '50%': {
            boxShadow:
              '0 4px 20px rgba(34, 197, 94, 0.6), 0 0 30px rgba(34, 197, 94, 0.5)',
          },
        },
      },

      borderRadius: {
        mhc: '8px',
        'mhc-lg': '12px',
      },

      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
