import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: any) {
  if (!date) return '-';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

export function formatDateTime(date: any) {
  if (!date) return '-';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
}
