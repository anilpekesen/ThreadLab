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
        slideUp: {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        fadeInUp:  'fadeInUp 0.2s ease-out',
        slideUp:   'slideUp 0.32s cubic-bezier(0.16,1,0.3,1)',
        fadeIn:    'fadeIn 0.2s ease-out',
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
