import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(value: number): string {
  return formatNumber(value) + 'đ';
}

export function formatDate(date: Date | string): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Get current date in Vietnam timezone as YYYY-MM-DD */
export function getTodayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function getDayBeforeYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Get current date in Vietnam timezone (for server-side use) */
export function getVietnamTodayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Normalize Vietnamese text for fuzzy matching (removes diacritics, lowercases) */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Fuzzy search: check if all search words exist in text (in any order) */
export function fuzzyMatch(text: string, search: string): boolean {
  const normalizedText = normalizeText(text);
  const searchWords = normalizeText(search).split(/\s+/).filter(Boolean);
  return searchWords.every(word => normalizedText.includes(word));
}

/** Parse Vietnam timezone today string into local Date components */
function parseVietnamToday(): { year: number; month: number; day: number } {
  const todayStr = getTodayISO();
  const [y, m, d] = todayStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** Get start of current week (Monday) in Vietnam timezone */
export function getThisWeekStartISO(): string {
  const { year, month, day } = parseVietnamToday();
  const today = new Date(year, month - 1, day);
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  today.setDate(today.getDate() - diff);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get start of last week (Monday) in Vietnam timezone */
export function getLastWeekStartISO(): string {
  const { year, month, day } = parseVietnamToday();
  const today = new Date(year, month - 1, day);
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  today.setDate(today.getDate() - diff - 7);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get end of last week (Sunday) in Vietnam timezone */
export function getLastWeekEndISO(): string {
  const { year, month, day } = parseVietnamToday();
  const today = new Date(year, month - 1, day);
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  today.setDate(today.getDate() - diff - 1);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get start of current month in Vietnam timezone */
export function getThisMonthStartISO(): string {
  const todayStr = getTodayISO();
  return todayStr.substring(0, 8) + '01';
}

/** Get start of last month in Vietnam timezone */
export function getLastMonthStartISO(): string {
  const { year, month } = parseVietnamToday();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
}

/** Get end of last month in Vietnam timezone */
export function getLastMonthEndISO(): string {
  const { year, month } = parseVietnamToday();
  const lastDay = new Date(year, month - 1, 0);
  const y = lastDay.getFullYear();
  const m = String(lastDay.getMonth() + 1).padStart(2, '0');
  const d = String(lastDay.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
