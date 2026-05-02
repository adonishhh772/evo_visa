import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b1220",
          900: "#111827",
          700: "#374151",
          500: "#6b7280",
        },
        accent: {
          DEFAULT: "#0f766e",
          muted: "#99f6e4",
        },
      },
    },
  },
  plugins: [],
};
export default config;
