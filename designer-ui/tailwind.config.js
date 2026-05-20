/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        layout: '860px',
      },
      keyframes: {
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translate(-50%, 12px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.2s ease-out',
      },
      colors: {
        surface: '#F9FAFB',
        panel: '#ffffff',
        border: '#e5e7eb',
        accent: '#2563eb',
        'accent-hover': '#1d4ed8',
      },
    },
  },
  plugins: [],
};
