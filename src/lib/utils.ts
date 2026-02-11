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

export function getTodayISO(): string {
  // Vietnam timezone (UTC+7)
  const now = new Date();
  const vnDate = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  return vnDate.toISOString().split('T')[0];
}

export function getYesterdayISO(): string {
  const now = new Date();
  const vnDate = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  vnDate.setDate(vnDate.getDate() - 1);
  return vnDate.toISOString().split('T')[0];
}

export function getDayBeforeYesterdayISO(): string {
  const now = new Date();
  const vnDate = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  vnDate.setDate(vnDate.getDate() - 2);
  return vnDate.toISOString().split('T')[0];
}
