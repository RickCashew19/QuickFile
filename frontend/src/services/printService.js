/**
 * Print Service
 * Wraps window.print() in an isolated service function
 * to facilitate pure unit testing and cross-platform portability.
 */
export const printService = {
  print: () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  },
};
