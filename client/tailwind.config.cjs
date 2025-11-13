module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: "#0b3d2e",
        rail: "#1e1915",
        boss: "#d7514d",
        accent: "#f5c76f"
      },
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        sans: ["'Inter'", "sans-serif"]
      }
    }
  },
  plugins: []
};
