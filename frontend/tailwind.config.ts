import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'status-active': '#28a745',
        'status-unreachable': '#dc3545',
        'status-unknown': '#6c757d',
      },
    },
  },
  plugins: [],
};

export default config;
