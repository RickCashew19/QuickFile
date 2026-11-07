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
 * Escapes characters with special meaning in Regular Expressions
 */
function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

module.exports = {
  getDateRanges,
  formatLocalTimestamp,
  escapeRegex,
};
