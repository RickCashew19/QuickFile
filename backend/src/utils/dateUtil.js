const { config } = require('../config');

/**
 * Calculates start and end of "today" and "this month" in the configured jurisdiction timezone.
 * Uses APP_TIMEZONE_OFFSET_MINUTES (default 480 for UTC+8 Philippines).
 *
 * @param {number} [offsetMinutes] Timezone offset in minutes (e.g. 480 for UTC+8)
 * @returns {{ startOfToday: Date, endOfToday: Date, startOfMonth: Date, endOfMonth: Date }}
 */
function getDateRanges(offsetMinutes = config.appTimezoneOffsetMinutes) {
  const now = new Date();
  const localTimeMs = now.getTime() + offsetMinutes * 60 * 1000;
  const localDate = new Date(localTimeMs);

  const year = localDate.getUTCFullYear();
  const month = localDate.getUTCMonth();
  const day = localDate.getUTCDate();

  // Convert local date boundaries back to UTC timestamps
  const startOfToday = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMinutes * 60 * 1000);
  const endOfToday = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMinutes * 60 * 1000);
  const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - offsetMinutes * 60 * 1000);
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999) - offsetMinutes * 60 * 1000);

  return {
    startOfToday,
    endOfToday,
    startOfMonth,
    endOfMonth,
    // Convenient aliases
    todayStart: startOfToday,
    todayEnd: endOfToday,
    monthStart,
    monthEnd,
  };
}

/**
 * Formats a Date object into a readable local timestamp string (YYYY-MM-DD HH:mm:ss)
 * in the configured timezone.
 *
 * @param {Date} [date]
 * @param {number} [offsetMinutes]
 * @returns {string}
 */
function formatLocalTimestamp(date = new Date(), offsetMinutes = config.appTimezoneOffsetMinutes) {
  const targetDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const localMs = targetDate.getTime() + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);

  const pad = (n) => String(n).padStart(2, '0');
  const Y = d.getUTCFullYear();
  const M = pad(d.getUTCMonth() + 1);
  const D = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const m = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());

  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/**
 * Formats a Date object into a readable local date string (YYYY-MM-DD)
 * in the configured timezone.
 *
 * @param {Date} [date]
 * @param {number} [offsetMinutes]
 * @returns {string}
 */
function formatLocalDate(date = new Date(), offsetMinutes = config.appTimezoneOffsetMinutes) {
  if (!date) return '';
  const targetDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date);
  if (isNaN(targetDate.getTime())) return '';
  const localMs = targetDate.getTime() + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);

  const pad = (n) => String(n).padStart(2, '0');
  const Y = d.getUTCFullYear();
  const M = pad(d.getUTCMonth() + 1);
  const D = pad(d.getUTCDate());

  return `${Y}-${M}-${D}`;
}

/**
 * Interprets from and to as calendar days in the barangay timezone
 * using APP_TIMEZONE_OFFSET_MINUTES for the range boundaries.
 *
 * @param {string} fromStr
 * @param {string} toStr
 * @param {number} [offsetMinutes]
 * @returns {{ fromDate: Date, toDate: Date, fromDateStr: string, toDateStr: string }}
 */
function parseLocalDateRange(fromStr, toStr, offsetMinutes = config.appTimezoneOffsetMinutes) {
  if (!fromStr || !toStr || typeof fromStr !== 'string' || typeof toStr !== 'string') {
    const error = new Error('Both "from" and "to" date parameters are required.');
    error.statusCode = 400;
    throw error;
  }

  const trimmedFrom = fromStr.trim();
  const trimmedTo = toStr.trim();

  // Validate ISO YYYY-MM-DD format
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(trimmedFrom) || !datePattern.test(trimmedTo)) {
    const error = new Error('Invalid date format for "from" or "to". Please use ISO 8601 (YYYY-MM-DD).');
    error.statusCode = 400;
    throw error;
  }

  const [fromY, fromM, fromD] = trimmedFrom.split('-').map(Number);
  const [toY, toM, toD] = trimmedTo.split('-').map(Number);

  // Compute local midnight in UTC milliseconds
  const fromUtcMs = Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0) - offsetMinutes * 60 * 1000;
  const toUtcMs = Date.UTC(toY, toM - 1, toD, 23, 59, 59, 999) - offsetMinutes * 60 * 1000;

  const fromDate = new Date(fromUtcMs);
  const toDate = new Date(toUtcMs);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    const error = new Error('Invalid calendar date value.');
    error.statusCode = 400;
    throw error;
  }

  if (fromDate > toDate) {
    const error = new Error('"from" date must be earlier than or equal to "to" date.');
    error.statusCode = 400;
    throw error;
  }

  const dayDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff > 366) {
    const error = new Error('Date range cannot exceed 366 days.');
    error.statusCode = 400;
    throw error;
  }

  return {
    fromDate,
    toDate,
    fromDateStr: trimmedFrom,
    toDateStr: trimmedTo,
  };
}

/**
 * Escapes characters with special meaning in Regular Expressions
 */
function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

module.exports = {
  getDateRanges,
  formatLocalTimestamp,
  formatLocalDate,
  parseLocalDateRange,
  escapeRegex,
};

