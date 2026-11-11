import { describe, expect, it } from 'vitest';
import { discountOnFare, isDiscountType, priceTicket } from './discount';

describe('the Senior Citizen / PWD discount', () => {
  it('takes 20% off one fare', () => {
    expect(discountOnFare(3000)).toBe(600);
    expect(priceTicket(3000, 1, 'senior')).toEqual({ totalCentavos: 2400, discountCentavos: 600 });
    expect(priceTicket(3000, 1, 'pwd')).toEqual({ totalCentavos: 2400, discountCentavos: 600 });
  });

  it('is the same 20% for a student', () => {
    expect(priceTicket(3000, 1, 'student')).toEqual({ totalCentavos: 2400, discountCentavos: 600 });
  });

  it('charges the full fare without a discount', () => {
    expect(priceTicket(3000, 1, null)).toEqual({ totalCentavos: 3000, discountCentavos: 0 });
    expect(priceTicket(3000, 4, null)).toEqual({ totalCentavos: 12000, discountCentavos: 0 });
  });

  it('on a group ticket reduces only ONE passenger: the ID holder, not the people with them', () => {
    // 4 people at 30.00: three pay 30.00, the holder pays 24.00
    expect(priceTicket(3000, 4, 'senior')).toEqual({ totalCentavos: 3 * 3000 + 2400, discountCentavos: 600 });
  });

  it('rounds to the nearest centavo', () => {
    expect(discountOnFare(1575)).toBe(315);
    expect(discountOnFare(1555)).toBe(311);
    expect(discountOnFare(1)).toBe(0);
  });

  it('only knows the three kinds', () => {
    expect(isDiscountType('senior')).toBe(true);
    expect(isDiscountType('pwd')).toBe(true);
    expect(isDiscountType('student')).toBe(true);
    for (const v of ['teacher', 'Senior', 'Student', '', null, undefined, 20]) expect(isDiscountType(v)).toBe(false);
  });
});
