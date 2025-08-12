/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // TalkGroup.ai Dark Theme with Bright Yellow Accent
        tg: {
          'bg-primary': '#0a0a0a',
          'bg-secondary': '#111111',
          'bg-tertiary': '#1a1a1a',
          'text-primary': '#ffffff',
          'text-secondary': 'rgba(255, 255, 255, 0.6)',
          'text-muted': 'rgba(255, 255, 255, 0.4)',
          'accent-primary': '#FFD400',
          'accent-secondary': '#FFC107',
          'accent-hover': '#FFE55C',
          'border-primary': 'rgba(255, 212, 0, 0.2)',
          'border-secondary': 'rgba(255, 255, 255, 0.15)',
        },
        // Bright Yellow accent color for easy access
        yellow: {
          400: '#FFD400', // Primary accent
          500: '#FFC107', // Secondary accent
          300: '#FFE55C', // Hover state
        }
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
