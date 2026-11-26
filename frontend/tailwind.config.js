/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dairy: {
          cream: '#FAF7F0',
          milk: '#FFFFFF',
          pasture: '#1B5E3A',
          pastureDark: '#124028',
          meadow: '#E8F3EC',
          earth: '#5C4738',
          amber: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
