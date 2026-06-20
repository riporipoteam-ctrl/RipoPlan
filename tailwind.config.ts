import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Nebula-inspired warm "paper" light theme + futuristic dark theme
        paper: {
          DEFAULT: "#f7f4ef",
          card: "#ffffff",
          border: "#e7e2d9",
          muted: "#8a8578",
        },
        nebula: {
          50: "#faf5ff",
          100: "#f3e8ff",
          400: "#c084fc",
          500: "#a855f7",
          600: "#9333ea",
          700: "#7e22ce",
          pink: "#d633b9",
        },
        ink: {
          DEFAULT: "#0b0b10",
          card: "#15151c",
          border: "#26262f",
          muted: "#9a9aa8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-dot": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
