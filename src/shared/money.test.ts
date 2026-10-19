import { describe, expect, it } from 'vitest';
import { formatPeso, pesosToCentavos } from './money';

describe('money', () => {
  it('formats centavos as pesos', () => {
    expect(formatPeso(1700)).toContain('17.00');
    expect(formatPeso(5)).toContain('0.05');
  });

  it('parses typed amounts into integer centavos without float drift', () => {
    expect(pesosToCentavos('25')).toBe(2500);
    expect(pesosToCentavos('25.5')).toBe(2550);
    expect(pesosToCentavos('₱1,200.05')).toBe(120005);
    expect(pesosToCentavos('0.29')).toBe(29); // 0.29 * 100 is 28.999… as a float
    expect(pesosToCentavos(' 15 ')).toBe(1500);
  });

  it('rejects anything that is not a plain non-negative amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1.2.3', '12 pesos']) expect(pesosToCentavos(bad)).toBeNull();
  });
});
