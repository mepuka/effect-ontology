/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"]
      },
      colors: {
        depth: {
          0: "hsl(25, 95%, 58%)", // Warm orange - shallow
          1: "hsl(45, 90%, 55%)", // Amber
          2: "hsl(60, 85%, 52%)", // Yellow-green
          3: "hsl(160, 70%, 48%)", // Teal
          4: "hsl(200, 75%, 50%)", // Blue
          5: "hsl(230, 70%, 55%)", // Indigo
          6: "hsl(260, 65%, 58%)" // Purple - deep
        }
      },
      animation: {
        "stagger-in": "staggerIn 0.5s ease-out"
      },
      keyframes: {
        staggerIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
}
