import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0B0C10",       // deep void charcoal backdrop
        panel: "#15171F",      // cyber slate panels
        panel2: "#1B1E2A",     // raised panel surface
        edge: "#262A38",       // panel border
        cyan: "#45A29E",       // electric cyan primary accent
        cyanDim: "#2F6F6C",
        crimson: "#FF0055",    // neon crimson alert
        crimsonDim: "#8F0A3C",
        acid: "#66FCF1",       // secondary glow (dashboard highlights)
        ghost: "#9BA3B5",      // muted text
        ink: "#E8EAF2",        // primary text
      },
      fontFamily: {
        display: ["var(--font-orbitron)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        neon: "0 0 18px rgba(69, 162, 158, 0.35)",
        neonSm: "0 0 10px rgba(69, 162, 158, 0.25)",
        crimson: "0 0 18px rgba(255, 0, 85, 0.4)",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        ticker: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
        gridDrift: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 40px" },
        },
      },
      animation: {
        scan: "scan 8s linear infinite",
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
        ticker: "ticker 22s linear infinite",
        gridDrift: "gridDrift 3s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
