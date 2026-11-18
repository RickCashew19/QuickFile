const { config } = require('../config');

/**
 * Builds a "document ready for pickup" calendar reminder in two formats:
 *  - an RFC 5545 .ics file (Apple Calendar, Outlook, Google import, etc.)
 *  - a public Google Calendar template URL (no API key, OAuth or scopes)
 *
 * This deliberately uses NO Google API credentials. The template link is a
 * plain public URL; the ICS file is generated locally. Nothing is sent to or
 * stored by Google by this module.
 *
 * The reminder is an all-day event on the local (Philippine) date the document
 * became ready, with a 1-day-before display alarm.
 */

const CALENDAR_TIMEZONE = 'Asia/Manila';
const encoder = new TextEncoder();

/** Escapes a TEXT property value per RFC 5545 section 3.3.11. */
function escapeIcsText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Folds a content line at 75 octets as required by RFC 5545 section 3.1.
 * Folding respects UTF-8 character boundaries so accented names are safe.
 */
function foldLine(line) {
  let result = '';
  let octets = 0;
  for (const char of String(line)) {
    const size = encoder.encode(char).length;
    const limit = result === '' ? 75 : 74; // continuation lines begin with a space
    if (octets + size > limit) {
      result += '\r\n ';
      octets = 1;
    }
    result += char;
    octets += size;
  }
  return result;
}

function formatDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** All-day DTEND is exclusive, so the end date is the day after the pickup date. */
function nextDay(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function formatUtcStamp(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`;
}

function compactDateKey(dateKey) {
  return dateKey.replace(/-/g, '');
}

/**
 * Creates the one canonical event object shared by the .ics and Google link,
 * so both formats always describe the same pickup.
 *
 * Data minimisation: only the tracking number and document type (already in
 * the pickup email) go into the calendar. No certificate number, citizen name,
 * address or other personal data is included.
 */
function buildPickupEvent({ trackingNumber = '', documentName = '', readyAt, requestUrl = '' } = {}) {
  const barangayName = config.jurisdiction.barangayName() || '';
  const venue = /hall/i.test(barangayName)
    ? barangayName
    : `${barangayName || 'Barangay'} Hall`;
  const location = [venue, config.jurisdiction.cityMunicipality(), config.jurisdiction.province()]
    .filter(Boolean)
    .join(', ');

  const readyDate = formatDateKey(readyAt instanceof Date ? readyAt : new Date(readyAt || Date.now()));
  const endDate = nextDay(readyDate);

  const title = `Pick up ${documentName || 'document'} (${trackingNumber || 'QuickFile'})`;
  const description = `Your QuickFile document is ready for pickup. Please present a valid ID.${
    requestUrl ? `\nTrack your request: ${requestUrl}` : ''
  }`;

  // Stable UID: the same request always produces the same calendar entry.
  const safeTracking = String(trackingNumber || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');

  return {
    uid: `quickfile-${safeTracking}@quickfile.local`,
    title,
    description,
    location,
    startDate: readyDate,
    endDate,
  };
}

/** Returns a complete RFC 5545 VCALENDAR string with CRLF line endings. */
function buildIcs(event) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuickFile//Document Pickup Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtcStamp(new Date())}`,
    `DTSTART;VALUE=DATE:${compactDateKey(event.startDate)}`,
    `DTEND;VALUE=DATE:${compactDateKey(event.endDate)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Document pickup reminder',
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/**
 * Public Google Calendar "add event" link. `dates` uses YYYYMMDD/YYYYMMDD for
 * an all-day event (end exclusive) and URLSearchParams handles all encoding.
 */
function buildGoogleCalendarLink(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactDateKey(event.startDate)}/${compactDateKey(event.endDate)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

module.exports = {
  escapeIcsText,
  foldLine,
  buildPickupEvent,
  buildIcs,
  buildGoogleCalendarLink,
};
