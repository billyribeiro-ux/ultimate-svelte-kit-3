import { describe, expect, it } from 'vitest';
import { formatMoney, fractionDigits, fromMinor, parseAmount, toMinor } from './money.ts';

// `Intl` puts a no-break space before a trailing currency sign; compare with a plain one.
const plain = (s: string) => s.replace(/[\u00a0\u2009\u200a\u202f]/g, ' ');

describe('minor units', () => {
	it('asks Intl how many decimals a currency has', () => {
		expect(fractionDigits('EUR')).toBe(2);
		expect(fractionDigits('JPY')).toBe(0);
	});

	it('converts without floating-point drift', () => {
		expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
		expect(toMinor(19.99, 'USD')).toBe(1999);
		expect(toMinor(1500, 'JPY')).toBe(1500);
		expect(fromMinor(1999, 'USD')).toBe(19.99);
	});
});

describe('formatMoney', () => {
	it('speaks the locale and the currency', () => {
		expect(plain(formatMoney(123456, 'EUR', 'de'))).toBe('1.234,56 €');
		expect(formatMoney(123456, 'EUR', 'en')).toBe('€1,234.56');
		expect(plain(formatMoney(123456, 'BRL', 'pt-BR'))).toBe('R$ 1.234,56');
		expect(formatMoney(1500, 'JPY', 'en')).toBe('¥1,500');
	});
});

describe('parseAmount', () => {
	it('reads the notation of the locale', () => {
		expect(parseAmount('1,234.50', 'en')).toBe(1234.5);
		expect(parseAmount('1.234,50', 'de')).toBe(1234.5);
		expect(parseAmount('1.234,50', 'pt-BR')).toBe(1234.5);
		expect(parseAmount('12,5', 'de')).toBe(12.5);
		expect(parseAmount('12.5', 'en')).toBe(12.5);
	});

	it('ignores currency signs and spaces', () => {
		expect(parseAmount('€ 42', 'de')).toBe(42);
		expect(parseAmount('$1,000', 'en')).toBe(1000);
		expect(parseAmount('R$ 9,90', 'pt-BR')).toBe(9.9);
	});

	it('returns null for nonsense', () => {
		expect(parseAmount('', 'en')).toBeNull();
		expect(parseAmount('abc', 'en')).toBeNull();
		expect(parseAmount('1.2.3', 'en')).toBeNull();
		expect(parseAmount('-', 'en')).toBeNull();
	});
});
