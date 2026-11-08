import '@testing-library/jest-dom';

// Polyfill window.matchMedia for JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Polyfill window.URL.createObjectURL and revokeObjectURL
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:mock-url';
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = () => {};
}
