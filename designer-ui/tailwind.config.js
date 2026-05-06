/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#18181b',
        panel: '#27272a',
        border: '#3f3f46',
        accent: '#6366f1',
        'accent-hover': '#4f46e5',
      },
    },
  },
  plugins: [],
};
