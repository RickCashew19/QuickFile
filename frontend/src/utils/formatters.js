import { STATUS_METADATA } from '../config/constants';

/**
 * Philippine Peso Currency Formatter
 * Returns "Free" when amount is zero or undefined
 */
export function formatCurrency(amount) {
  const numeric = Number(amount);
  if (isNaN(numeric) || numeric === 0) {
    return 'Free';
  }
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

/**
 * Standard Date & Time Formatter in Asia/Manila Timezone
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Date-only Formatter in Asia/Manila Timezone
 */
export function formatDate(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * File Size Formatter (Bytes to human readable KB/MB)
 */
export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const size = (num / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1);

  return `${size} ${units[index]}`;
}

/**
 * Status Metadata Helper
 */
export function getStatusMeta(status) {
  const key = String(status || '').toLowerCase().trim();
  return (
    STATUS_METADATA[key] || {
      label: key.replace(/_/g, ' ') || 'Unknown',
      variant: 'neutral',
      description: '',
    }
  );
}
