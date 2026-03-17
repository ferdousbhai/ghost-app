/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ghost: {
          dark: "oklch(0.11 0.015 265)",
          surface: "oklch(0.14 0.012 265)",
          card: "oklch(0.17 0.01 265)",
          border: "oklch(0.24 0.01 265)",
          muted: "oklch(0.55 0.01 265)",
          amber: "oklch(0.78 0.16 65)",
          orange: "oklch(0.72 0.17 45)",
          rose: "oklch(0.65 0.2 15)",
        },
      },
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
