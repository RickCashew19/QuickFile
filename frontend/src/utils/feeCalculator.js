import { formatCurrency } from './formatters';

/**
 * Calculates display fee summary for citizen document requests
 * (Note: The server computes the final authoritative fee)
 */
export function calculateDisplayFee(unitFee, copies = 1) {
  const numericUnit = Number(unitFee) || 0;
  const numericCopies = Math.max(1, Math.min(10, parseInt(copies, 10) || 1));
  const total = numericUnit * numericCopies;

  return {
    unitFee: numericUnit,
    copies: numericCopies,
    totalFee: total,
    displayFee: formatCurrency(total),
    displayUnitFee: formatCurrency(numericUnit),
  };
}
