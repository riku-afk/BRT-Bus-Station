/** Money is integer centavos (PHP); convert only at the edge (GEN-03). */
const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export function formatPeso(centavos: number): string {
  return pesos.format(centavos / 100);
}

/**
 * Parse what an admin types ("25", "25.5", "₱25.50", "1,200") into integer centavos.
 * Returns null for anything that is not a non-negative amount with at most two decimals.
 */
export function pesosToCentavos(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
