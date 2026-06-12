/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: '#0F0F0F',
        'ink-soft': '#6B7280',
        mist: '#F5F6F8',
        'mist-dark': '#E8EAF0',
        accent: '#2563EB',
        'accent-light': '#DBEAFE',
        positive: '#16A34A',
        'positive-light': '#DCFCE7',
        warning: '#D97706',
        'warning-light': '#FEF3C7',
        danger: '#DC2626',
        'danger-light': '#FEE2E2',
        surface: '#FFFFFF',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      minHeight: {
        touch: '48px',
      },
      fontSize: {
        'input': ['16px', '24px'],
      },
    },
  },
  plugins: [],
}
