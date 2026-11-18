/**
 * Pickup calendar reminder tests (no Google API involved).
 *
 * Covers RFC 5545 .ics generation (CRLF, folding, escaping, all-day dates),
 * the public Google Calendar template link, data minimisation, and the
 * nodemailer attachment pass-through used by the pickup email.
 * No real secrets are read or printed.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const TEST_ENV_PATH = path.resolve(__dirname, 'test_calendar.env.tmp');

process.env.NODE_ENV = 'test';
process.env.ENV_FILE = TEST_ENV_PATH;
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/quickfile_calendar_test';
process.env.JWT_SECRET = 'quickfile_calendar_test_jwt_secret_at_least_32_chars';
process.env.SU_ADMIN_KEY = 'su_key_calendar_test_12345';
process.env.BARANGAY_NAME = 'Barangay 11';
process.env.CITY_MUNICIPALITY = 'Malaybalay';
process.env.PROVINCE = 'Bukidnon';
process.env.PUBLIC_APP_URL = 'http://localhost:5173';
process.env.FRONTEND_URL = 'http://localhost:5173';

fs.writeFileSync(
  TEST_ENV_PATH,
  [
    'NODE_ENV=test',
    `MONGO_URI=${process.env.MONGO_URI}`,
    `JWT_SECRET=${process.env.JWT_SECRET}`,
    `SU_ADMIN_KEY=${process.env.SU_ADMIN_KEY}`,
    `BARANGAY_NAME=${process.env.BARANGAY_NAME}`,
    `CITY_MUNICIPALITY=${process.env.CITY_MUNICIPALITY}`,
    `PROVINCE=${process.env.PROVINCE}`,
    `PUBLIC_APP_URL=${process.env.PUBLIC_APP_URL}`,
  ].join('\n'),
  'utf8'
);

const {
  escapeIcsText,
  foldLine,
  buildPickupEvent,
  buildIcs,
  buildGoogleCalendarLink,
} = require('../src/helpers/calendarInvite');
const { sendMail, setMailTransport } = require('../src/helpers/mailer');

const READY_AT = new Date('2026-11-18T15:30:00Z'); // 23:30 in Asia/Manila -> same local day

function testEvent(overrides = {}) {
  return buildPickupEvent({
    trackingNumber: 'QF-2026-0417',
    documentName: 'Barangay Clearance',
    readyAt: READY_AT,
    requestUrl: 'http://localhost:5173/citizen/requests/QF-2026-0417',
    ...overrides,
  });
}

function runTests() {
  console.log('====================================================================');
  console.log('      PICKUP CALENDAR REMINDER TEST SUITE                           ');
  console.log('====================================================================\n');

  // 1. TEXT escaping happens in the correct order (backslash first).
  assert.strictEqual(escapeIcsText('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne');
  console.log('PASS: 1. ICS TEXT values are escaped (backslash / ; / , / newline).\n');

  // 2. Folding keeps every line <= 75 octets and survives UTF-8 boundaries.
  const longValue = `X${'Y'.repeat(200)}ñ`;
  const folded = foldLine(`SUMMARY:${longValue}`);
  const lines = folded.split('\r\n');
  assert(lines.every((line) => Buffer.byteLength(line, 'utf8') <= 75), 'folded line exceeds 75 octets');
  assert(folded.includes('\r\n '), 'long line must be folded with CRLF + space');
  assert.strictEqual(folded.replace(/\r\n /g, ''), `SUMMARY:${longValue}`, 'unfolding must restore original value');
  console.log('PASS: 2. Lines fold at 75 octets without splitting multi-byte characters.\n');

  // 3. Event uses the correct local date, exclusive all-day end and jurisdiction.
  const event = testEvent();
  assert.strictEqual(event.startDate, '2026-11-18');
  assert.strictEqual(event.endDate, '2026-11-19');
  assert.strictEqual(event.uid, 'quickfile-QF-2026-0417@quickfile.local');
  assert.strictEqual(
    event.location,
    'Barangay 11 Hall, Malaybalay, Bukidnon',
    'location comes from jurisdiction config'
  );
  assert.strictEqual(testEvent().uid, event.uid, 'UID must be stable for the same request');
  const afterMidnight = testEvent({ readyAt: new Date('2026-11-18T16:00:00Z') });
  assert.strictEqual(afterMidnight.startDate, '2026-11-19', 'Manila local date must be used');
  console.log('PASS: 3. All-day date (Asia/Manila), exclusive end, stable UID and location.\n');

  // 4. ICS is valid CRLF-only with correct structure, alarm and escaping.
  const hostileName = 'Clearance; "Form, 2026"\nINJECTED:evil';
  const hostileEvent = testEvent({ documentName: hostileName });
  const ics = buildIcs(hostileEvent);
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'must start with VCALENDAR');
  assert(ics.endsWith('END:VCALENDAR\r\n'), 'must end with VCALENDAR');
  assert(!ics.replace(/\r\n/g, '').includes('\n'), 'no bare LF allowed');
  assert(ics.includes('DTSTART;VALUE=DATE:20261118'));
  assert(ics.includes('DTEND;VALUE=DATE:20261119'));
  // Verify the escaped SUMMARY unfolds back to the hostile-but-harmless original text.
  const summaryLine = ics.split('\r\n').find((l) => l.startsWith('SUMMARY:')).replace(/\r\n /g, '');
  assert(summaryLine.includes('\\;'), 'semicolon must be escaped');
  assert(summaryLine.includes('\\,'), 'comma must be escaped');
  assert(summaryLine.includes('\\n'), 'newline must be escaped');
  assert(!summaryLine.includes('\nINJECTED'), 'raw newline must not appear in a property');
  assert(ics.includes('TRIGGER:-P1D'), '1-day reminder alarm must be present');
  assert(ics.includes('BEGIN:VALARM') && ics.includes('END:VALARM'));
  assert(ics.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75), 'every line <= 75 octets');
  console.log('PASS: 4. ICS structure, CRLF, escaping, folding and 1-day alarm.\n');

  // 5. Data minimisation: no certificate number, citizen PII or API keys.
  // Extra personal fields must be ignored even if a caller passes them in.
  const icsBody = buildIcs(buildPickupEvent({
    trackingNumber: 'QF-2026-0417',
    documentName: 'Barangay Clearance',
    readyAt: READY_AT,
    citizenName: 'Juan Dela Cruz',
    certificateNumber: 'CERT-2026-999',
  }));
  assert(!/AIza[0-9A-Za-z_-]{20,}/.test(icsBody), 'no Google API key may be embedded');
  assert(!icsBody.includes('CERT-'), 'certificate numbers must not be in the calendar');
  assert(!icsBody.includes('Juan Dela Cruz'), 'citizen names must not be in the calendar');
  console.log('PASS: 5. No API key, certificate number or citizen PII in calendar files.\n');

  // 6. Public Google Calendar template link needs no credentials and encodes values.
  const link = buildGoogleCalendarLink(hostileEvent);
  assert(link.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&'));
  assert(!/AIza[0-9A-Za-z_-]{20,}/.test(link), 'no API key parameter');
  assert(!link.includes('key=') && !link.includes('client_id='), 'no credential parameters');
  const params = new URLSearchParams(link.split('?')[1]);
  assert.strictEqual(params.get('text'), `Pick up ${hostileName} (QF-2026-0417)`);
  assert.strictEqual(params.get('dates'), '20261118/20261119');
  assert.strictEqual(params.get('location'), event.location);
  assert(params.get('details').includes('Please present a valid ID'));
  console.log('PASS: 6. Google Calendar link is credential-free and fully URL-encoded.\n');

  // 7. Mailer forwards attachments only when provided (no behavior change otherwise).
  const captured = [];
  setMailTransport({ sendMail: async (mail) => { captured.push(mail); return { messageId: 'test-id' }; } });
  (async () => {
    await sendMail({
      to: 'citizen@example.test',
      subject: 'Pickup',
      html: '<p>Hello</p>',
      isTransactional: true,
      attachments: [{ filename: 'pickup.ics', content: ics, contentType: 'text/calendar' }],
    });
    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].attachments[0].filename, 'pickup.ics');
    assert.strictEqual(captured[0].attachments[0].content, ics);

    await sendMail({ to: 'citizen@example.test', subject: 'Plain', text: 'Hi', isTransactional: true });
    assert.strictEqual(captured.length, 2);
    assert(!('attachments' in captured[1]), 'no attachments key when none supplied');
    console.log('PASS: 7. Attachment pass-through works; ordinary emails are unchanged.\n');

    console.log('ALL PICKUP CALENDAR REMINDER CHECKS PASSED.');
  })().catch((err) => {
    console.error('CALENDAR REMINDER SUITE FAILED:', err);
    process.exitCode = 1;
  });
}

try {
  runTests();
} catch (err) {
  console.error('CALENDAR REMINDER SUITE FAILED:', err);
  process.exitCode = 1;
}
