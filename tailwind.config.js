/** @type {import('tailwindcss').Config} */
const OPEN_SANS = ["Open Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"];

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // The app's classNames use font-serif / font-mono / font-sans in various
      // places; all three are pointed at Open Sans here so every bit of text
      // renders in the same requested font without editing each className.
      fontFamily: {
        sans: OPEN_SANS,
        serif: OPEN_SANS,
        mono: OPEN_SANS,
      },
    },
  },
  plugins: [],
};
