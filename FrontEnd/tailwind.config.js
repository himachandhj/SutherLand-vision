/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brandBlue: "#27235C",
        brandRed: "#DE1B54",
        brand: {
          blue: "#27235C",
          "blue-light": "#3D3880",
          "blue-dark": "#1A1840",
          "blue-tint": "#EEEDF7",
          red: "#DE1B54",
          "red-light": "#F04E7A",
          "red-dark": "#A01240",
          "red-tint": "#FDE8EF",
        },
        ink: "#1A1A2E",
        muted: "#6B6B8A",
        surface: "#F5F5F8",
        borderSoft: "#E2E2EC",
      },
      boxShadow: {
        panel: "0 12px 32px rgba(39, 35, 92, 0.08)",
        card: "0 10px 30px rgba(26, 24, 64, 0.08)",
      },
      fontFamily: {
        sans: ["Inter", "Arial", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
