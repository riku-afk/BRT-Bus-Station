/**
 * The Senior Citizen, PWD and Student fare discount (browser-safe: the server prices tickets with it, the screens only preview the result).
 *
 * The law gives 20% off the fare of the person who holds the ID. It is not given to the people travelling with them, so on a group
 * ticket only ONE passenger's fare is reduced and the rest pay in full. Two discounts never stack (a person who is both gets one 20%).
 * Money is integer centavos, as everywhere else.
 */
export const DISCOUNT_TYPES = ['senior', 'pwd', 'student'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_PERCENT = 20;

export const DISCOUNT_LABEL: Readonly<Record<DiscountType, string>> = { senior: 'Senior Citizen', pwd: 'PWD', student: 'Student' };

export const isDiscountType = (value: unknown): value is DiscountType => typeof value === 'string' && (DISCOUNT_TYPES as readonly string[]).includes(value);

/** What 20% of one fare comes to, to the nearest centavo. */
export const discountOnFare = (unitFareCentavos: number): number => Math.round((unitFareCentavos * DISCOUNT_PERCENT) / 100);

/**
 * The total for `quantity` passengers at `unitFareCentavos` each, and how much of it is discount. With a discount type, one passenger
 * (the ID holder) gets 20% off; without one the discount is zero.
 */
export function priceTicket(unitFareCentavos: number, quantity: number, discount: DiscountType | null): { totalCentavos: number; discountCentavos: number } {
  const discountCentavos = discount ? discountOnFare(unitFareCentavos) : 0;
  return { totalCentavos: unitFareCentavos * quantity - discountCentavos, discountCentavos };
}
