import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "monday-bg": "var(--monday-bg)",
        "monday-surface": "var(--monday-surface)",
        "monday-border": "var(--monday-border)",
        "monday-text": "var(--monday-text)",
        "monday-text-muted": "var(--monday-text-muted)",
        "monday-blue": "var(--monday-blue)",
        "monday-row-hover": "var(--monday-row-hover)",
        "wp-primary": "var(--wp-primary)",
        "wp-primary-dark": "var(--wp-primary-dark)",
        "wp-primary-light": "var(--wp-primary-light)",
        "wp-secondary": "var(--wp-secondary)",
        "wp-success": "var(--wp-success)",
        "wp-warning": "var(--wp-warning)",
        "wp-danger": "var(--wp-danger)",
        "wp-bg": "var(--wp-bg)",
        "wp-surface": "var(--wp-surface)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: { sans: ["var(--font-primary)", "var(--wp-font)", "system-ui", "sans-serif"], mono: ["var(--wp-font-mono)", "monospace"] },
      fontSize: { monday: ["13px", { lineHeight: "1.4" }], "monday-sm": ["12px", { lineHeight: "1.4" }] },
      keyframes: {
        shimmer: {
          "0%": { transform: "skewX(-20deg) translateX(-150%)" },
          "100%": { transform: "skewX(-20deg) translateX(150%)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
