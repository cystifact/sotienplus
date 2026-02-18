import { describe, it, expect } from 'vitest';
import { formatNumber, formatCurrency, formatDate, formatDateISO } from '../utils';

describe('utils', () => {
  describe('formatNumber', () => {
    it('should format integer with Vietnamese locale', () => {
      const result = formatNumber(1234567);
      // vi-VN uses period as thousand separator
      expect(result).toMatch(/1[\.\s]234[\.\s]567/);
    });

    it('should format with decimal places', () => {
      const result = formatNumber(1234.5, 2);
      // vi-VN: "1.234,50" (period as thousands sep, comma as decimal)
      expect(result).toMatch(/1[\.\s]234/);
      expect(result).toMatch(/50/);
    });

    it('should format zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should format negative numbers', () => {
      const result = formatNumber(-1000);
      expect(result).toContain('1');
      expect(result).toContain('000');
    });
  });

  describe('formatCurrency', () => {
    it('should append đ suffix', () => {
      const result = formatCurrency(100000);
      expect(result).toMatch(/đ$/);
    });

    it('should format zero with suffix', () => {
      expect(formatCurrency(0)).toBe('0đ');
    });
  });

  describe('formatDate', () => {
    it('should format Date object in Vietnamese locale', () => {
      const date = new Date('2025-01-15T00:00:00Z');
      const result = formatDate(date);
      // dd/MM/yyyy format
      expect(result).toMatch(/15/);
      expect(result).toMatch(/01/);
      expect(result).toMatch(/2025/);
    });

    it('should format date string', () => {
      const result = formatDate('2025-06-30');
      expect(result).toMatch(/30/);
      expect(result).toMatch(/06|6/);
      expect(result).toMatch(/2025/);
    });

    it('should return - for falsy value', () => {
      expect(formatDate('')).toBe('-');
      expect(formatDate(null as any)).toBe('-');
    });

    it('should return - for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('-');
    });
  });

  describe('formatDateISO', () => {
    it('should return YYYY-MM-DD format', () => {
      const date = new Date('2025-03-05T12:00:00Z');
      const result = formatDateISO(date);
      expect(result).toBe('2025-03-05');
    });
  });
});
