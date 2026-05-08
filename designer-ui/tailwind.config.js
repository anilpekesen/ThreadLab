/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
