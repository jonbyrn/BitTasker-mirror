// import konstaConfig config
const konstaConfig = require('konsta/config');

// wrap config with konstaConfig config
module.exports = konstaConfig({
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class', // or 'class'
  konsta: {
    colors: {
      primary: "#FF9315"
    }
  },
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF9315',
          50: '#FFF1E1',
          100: '#FFE4C7',
          200: '#FFCB94',
          300: '#FFB261',
          400: '#FF992E',
          500: '#FF9315',
          600: '#DB7700',
          700: '#A85C00',
          800: '#754000',
          900: '#422400',
          950: '#281500'
        }
      }
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
});
