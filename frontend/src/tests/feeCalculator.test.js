import { describe, it, expect } from 'vitest';
import { calculateDisplayFee } from '../utils/feeCalculator';

describe('Fee Calculator Suite', () => {
  it('multiplies unit fee by copies correctly', () => {
    const result = calculateDisplayFee(75, 2);
    expect(result.unitFee).toBe(75);
    expect(result.copies).toBe(2);
    expect(result.totalFee).toBe(150);
    expect(result.displayFee).toContain('150.00');
  });

  it('clamps copies between 1 and 10', () => {
    expect(calculateDisplayFee(50, 0).copies).toBe(1);
    expect(calculateDisplayFee(50, -5).copies).toBe(1);
    expect(calculateDisplayFee(50, 15).copies).toBe(10);
  });

  it('handles zero or free documents', () => {
    const free = calculateDisplayFee(0, 3);
    expect(free.totalFee).toBe(0);
    expect(free.displayFee).toBe('Free');
  });
});
