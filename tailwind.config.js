/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 10px 25px rgba(15, 23, 42, 0.10)',
      },
      colors: {
        harvey: {
          red: '#d71920',
          dark: '#111827',
          light: '#f9fafb',
          slate: '#1f2937',
          muted: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
