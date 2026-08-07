module.exports = {
  content: ['./www/index.html'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdfa', 100: '#ccfbf1', 600: '#0d9488', 700: '#0f766e', 800: '#115e59' }
      },
      boxShadow: {
        panel: '0 18px 45px rgba(15, 23, 42, 0.18)',
        float: '0 8px 24px rgba(15, 23, 42, 0.16)'
      }
    }
  },
  plugins: []
};
