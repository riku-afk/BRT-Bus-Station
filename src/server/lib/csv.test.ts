import { describe, expect, it } from 'vitest';
import { BOM, centavosToDecimal, csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes cells that need it and leaves plain ones alone', () => {
    expect(csvCell('Imus')).toBe('Imus');
    expect(csvCell('Bacoor, Cavite')).toBe('"Bacoor, Cavite"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('defuses spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('writes a BOM, a header and CRLF rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [null, 'y,z']])).toBe(`${BOM}a,b\r\n1,x\r\n,"y,z"\r\n`);
    expect(BOM.charCodeAt(0)).toBe(0xfeff);
  });

  it('turns centavos into a peso amount without floats', () => {
    expect(centavosToDecimal(1700)).toBe('17.00');
    expect(centavosToDecimal(5)).toBe('0.05');
    expect(centavosToDecimal(123456)).toBe('1234.56');
    expect(centavosToDecimal(0)).toBe('0.00');
    expect(centavosToDecimal(-250)).toBe('-2.50');
  });
});
