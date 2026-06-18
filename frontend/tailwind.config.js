/** @type {import('tailwindcss').Config} */
// Colors are NOT redefined here — palette lives in src/lib/tokens.ts and is
// applied via inline styles (matching the design prototypes). Tailwind handles
// layout, spacing, and responsive utilities only.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
