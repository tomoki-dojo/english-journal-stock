import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        // ライトテーマ移行に伴い、ダークテーマ用に底上げしていたzincのカスタム値は撤去。
        // Tailwindデフォルトのzincスケールをそのまま使う。
      },
    },
  },
  plugins: [],
};
export default config;
