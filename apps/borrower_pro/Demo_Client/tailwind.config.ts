import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

/**
 * HSL components (no hsl() wrapper) for CSS variables — single source of truth for the palette.
 * Injected as :root / .dark via addBase below; Tailwind utilities use hsl(var(--token)) in theme.extend.
 */
const lightThemeCssVars: Record<string, string> = {
  background: "0 0% 100%",
  foreground: "0 0% 4%",
  surface: "0 0% 98%",
  card: "0 0% 98%",
  "card-foreground": "0 0% 4%",
  popover: "0 0% 100%",
  "popover-foreground": "0 0% 4%",
  primary: "0 0% 9%",
  "primary-foreground": "0 0% 98%",
  secondary: "0 0% 96%",
  "secondary-foreground": "0 0% 9%",
  muted: "0 0% 55%",
  "muted-foreground": "0 0% 45%",
  accent: "0 0% 96%",
  "accent-foreground": "0 0% 9%",
  destructive: "0 84% 60%",
  "destructive-foreground": "0 0% 100%",
  success: "142 71% 46%",
  "success-foreground": "0 0% 100%",
  warning: "38 92% 50%",
  "warning-foreground": "0 0% 4%",
  error: "0 84% 60%",
  "error-foreground": "0 0% 100%",
  info: "217 91% 60%",
  "info-foreground": "0 0% 100%",
  border: "0 0% 90%",
  input: "0 0% 90%",
  ring: "0 0% 4%",
  radius: "0.5rem",
};

const darkThemeCssVars: Record<string, string> = {
  background: "0 0% 4%",
  foreground: "0 0% 98%",
  surface: "0 0% 9%",
  card: "0 0% 9%",
  "card-foreground": "0 0% 98%",
  popover: "0 0% 7%",
  "popover-foreground": "0 0% 98%",
  primary: "0 0% 98%",
  "primary-foreground": "0 0% 4%",
  secondary: "0 0% 14%",
  "secondary-foreground": "0 0% 98%",
  muted: "0 0% 55%",
  "muted-foreground": "0 0% 55%",
  accent: "0 0% 14%",
  "accent-foreground": "0 0% 98%",
  destructive: "0 84% 60%",
  "destructive-foreground": "0 0% 100%",
  success: "142 71% 46%",
  "success-foreground": "0 0% 100%",
  warning: "38 92% 50%",
  "warning-foreground": "0 0% 98%",
  error: "0 84% 60%",
  "error-foreground": "0 0% 100%",
  info: "217 91% 60%",
  "info-foreground": "0 0% 100%",
  border: "0 0% 16%",
  input: "0 0% 16%",
  ring: "0 0% 98%",
};

function cssCustomProperties(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [`--${key}`, value])
  );
}

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "../components/**/*.{js,ts,jsx,tsx,mdx}",
    "../lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],
        sm: ["0.9075rem", { lineHeight: "1.375rem" }],
        base: ["1.03125rem", { lineHeight: "1.625rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.5rem", { lineHeight: "2rem" }],
        "2xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "3xl": ["2.375rem", { lineHeight: "2.75rem" }],
        "4xl": ["3rem", { lineHeight: "3.25rem" }],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        surface: "hsl(var(--surface))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        heading: ["Rethink Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    plugin(({ addBase }) => {
      addBase({
        ":root": cssCustomProperties(lightThemeCssVars),
        ".dark": cssCustomProperties(darkThemeCssVars),
      });
    }),
  ],
};

export default config;
