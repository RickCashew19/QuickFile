const { config } = require('../config');

/**
 * Strips invalid XML 1.0 control characters and caps length at 500 characters
 */
function sanitizeXmlString(val) {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : String(val);
  // Remove control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.slice(0, 500);
}

/**
 * Returns integer ordinal suffix (e.g. 1st, 2nd, 3rd, 15th, 21st, 22nd, 23rd, 31st)
 */
function getOrdinal(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Shifts a Date into the jurisdiction timezone for formatting
 */
function toLocalTime(date, offsetMinutes = config.appTimezoneOffsetMinutes) {
  if (!date) return null;
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + offsetMinutes * 60 * 1000);
}

/**
 * Computes citizen age in years at document issue date in jurisdiction timezone
 */
function calculateAge(birthDate, issueDate, offsetMinutes = config.appTimezoneOffsetMinutes) {
  if (!birthDate) return '';
  const b = toLocalTime(birthDate, offsetMinutes);
  const i = toLocalTime(issueDate || new Date(), offsetMinutes);
  if (!b || !i) return '';
  let age = i.getUTCFullYear() - b.getUTCFullYear();
  const m = i.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && i.getUTCDate() < b.getUTCDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '';
}

/**
 * Single source of truth catalog for certificate template placeholders.
 * Allowlist only: Citizen, Request, Document, and Barangay groups.
 * Sensitive values (phone, email, ID numbers, voter status) are strictly excluded.
 */
const PLACEHOLDER_CATALOG = [
  // ---------------------------------------------------------------------------
  // Citizen Group
  // ---------------------------------------------------------------------------
  {
    key: 'full_name',
    label: 'Citizen Full Name',
    group: 'citizen',
    example: 'Juan Dela Cruz',
    build: (ctx) => ctx.citizen?.full_name || '',
  },
  {
    key: 'full_name_upper',
    label: 'Citizen Full Name (Uppercase)',
    group: 'citizen',
    example: 'JUAN DELA CRUZ',
    build: (ctx) => (ctx.citizen?.full_name || '').toUpperCase(),
  },
  {
    key: 'first_name',
    label: 'First Name',
    group: 'citizen',
    example: 'Juan',
    build: (ctx) => ctx.citizenProfile?.first_name || '',
  },
  {
    key: 'middle_name',
    label: 'Middle Name',
    group: 'citizen',
    example: 'Santos',
    build: (ctx) => ctx.citizenProfile?.middle_name || '',
  },
  {
    key: 'last_name',
    label: 'Last Name',
    group: 'citizen',
    example: 'Dela Cruz',
    build: (ctx) => ctx.citizenProfile?.last_name || '',
  },
  {
    key: 'suffix',
    label: 'Suffix',
    group: 'citizen',
    example: 'Jr.',
    build: (ctx) => ctx.citizenProfile?.suffix || '',
  },
  {
    key: 'civil_status',
    label: 'Civil Status',
    group: 'citizen',
    example: 'Single',
    build: (ctx) => {
      const status = ctx.citizenProfile?.civil_status || '';
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
    },
  },
  {
    key: 'gender',
    label: 'Gender',
    group: 'citizen',
    example: 'Male',
    build: (ctx) => {
      const g = ctx.citizenProfile?.gender || '';
      return g ? g.charAt(0).toUpperCase() + g.slice(1) : '';
    },
  },
  {
    key: 'birthdate_long',
    label: 'Birthdate (Long)',
    group: 'citizen',
    example: 'June 15, 1995',
    build: (ctx) => {
      const d = toLocalTime(ctx.citizenProfile?.birthdate);
      if (!d) return '';
      return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    },
  },
  {
    key: 'age',
    label: 'Age at Issue Date',
    group: 'citizen',
    example: '30',
    build: (ctx) =>
      calculateAge(ctx.citizenProfile?.birthdate, ctx.issuedDocument?.issued_at),
  },
  {
    key: 'address',
    label: 'Full Street & Purok Address',
    group: 'citizen',
    example: '123 Rizal Street, Zone 4',
    build: (ctx) => {
      const parts = [
        ctx.citizenProfile?.street_address,
        ctx.citizenProfile?.purok_zone,
      ].filter(Boolean);
      return parts.join(', ');
    },
  },
  {
    key: 'purok_zone',
    label: 'Purok / Zone',
    group: 'citizen',
    example: 'Zone 4',
    build: (ctx) => ctx.citizenProfile?.purok_zone || '',
  },
  {
    key: 'barangay',
    label: 'Barangay (Resident Address)',
    group: 'citizen',
    example: 'Barangay 11',
    build: (ctx) =>
      ctx.citizenProfile?.barangay || config.jurisdiction.barangayName(),
  },
  {
    key: 'city',
    label: 'City / Municipality (Resident Address)',
    group: 'citizen',
    example: 'Malaybalay',
    build: (ctx) =>
      ctx.citizenProfile?.city || config.jurisdiction.cityMunicipality(),
  },
  {
    key: 'province',
    label: 'Province (Resident Address)',
    group: 'citizen',
    example: 'Bukidnon',
    build: (ctx) =>
      ctx.citizenProfile?.province || config.jurisdiction.province(),
  },
  {
    key: 'occupation',
    label: 'Occupation',
    group: 'citizen',
    example: 'Office Clerk',
    build: (ctx) => ctx.citizenProfile?.occupation || '',
  },

  // ---------------------------------------------------------------------------
  // Request Group
  // ---------------------------------------------------------------------------
  {
    key: 'purpose',
    label: 'Document Purpose',
    group: 'request',
    example: 'Employment requirement',
    build: (ctx) => ctx.request?.purpose || '',
  },
  {
    key: 'copies',
    label: 'Number of Copies',
    group: 'request',
    example: '1',
    build: (ctx) => String(ctx.request?.copies || 1),
  },
  {
    key: 'tracking_number',
    label: 'Request Tracking Number',
    group: 'request',
    example: 'QF-2026-0001',
    build: (ctx) => ctx.request?.tracking_number || '',
  },

  // ---------------------------------------------------------------------------
  // Document Group
  // ---------------------------------------------------------------------------
  {
    key: 'document_name',
    label: 'Document Name',
    group: 'document',
    example: 'Barangay Clearance',
    build: (ctx) => ctx.documentType?.name || '',
  },
  {
    key: 'document_name_upper',
    label: 'Document Name (Uppercase)',
    group: 'document',
    example: 'BARANGAY CLEARANCE',
    build: (ctx) => (ctx.documentType?.name || '').toUpperCase(),
  },
  {
    key: 'document_code',
    label: 'Document Code',
    group: 'document',
    example: 'BC',
    build: (ctx) => ctx.documentType?.code || '',
  },
  {
    key: 'certificate_number',
    label: 'Certificate Number',
    group: 'document',
    example: 'BRGY-BC-2026-123456',
    build: (ctx) => ctx.issuedDocument?.certificate_number || '',
  },
  {
    key: 'verification_code',
    label: 'Verification Code',
    group: 'document',
    example: 'A1B2C3D4E5F6G7H8J9K0',
    build: (ctx) => ctx.issuedDocument?.verification_code || '',
  },
  {
    key: 'verification_url',
    label: 'Public Verification URL',
    group: 'document',
    example: `${config.publicAppUrl}/verify/A1B2C3D4E5F6G7H8J9K0`,
    build: (ctx) => ctx.issuedDocument?.qr_data || '',
  },
  {
    key: 'issued_date',
    label: 'Issued Date',
    group: 'document',
    example: 'March 15, 2026',
    build: (ctx) => {
      const d = toLocalTime(ctx.issuedDocument?.issued_at || new Date());
      if (!d) return '';
      return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    },
  },
  {
    key: 'issued_date_long',
    label: 'Issued Date (Formal Long Form)',
    group: 'document',
    example: '15th day of March, 2026',
    build: (ctx) => {
      const d = toLocalTime(ctx.issuedDocument?.issued_at || new Date());
      if (!d) return '';
      return `${getOrdinal(d.getUTCDate())} day of ${MONTH_NAMES[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
    },
  },
  {
    key: 'issued_day_ordinal',
    label: 'Issued Day Ordinal',
    group: 'document',
    example: '15th',
    build: (ctx) => {
      const d = toLocalTime(ctx.issuedDocument?.issued_at || new Date());
      if (!d) return '';
      return getOrdinal(d.getUTCDate());
    },
  },
  {
    key: 'issued_month',
    label: 'Issued Month',
    group: 'document',
    example: 'March',
    build: (ctx) => {
      const d = toLocalTime(ctx.issuedDocument?.issued_at || new Date());
      if (!d) return '';
      return MONTH_NAMES[d.getUTCMonth()];
    },
  },
  {
    key: 'issued_year',
    label: 'Issued Year',
    group: 'document',
    example: '2026',
    build: (ctx) => {
      const d = toLocalTime(ctx.issuedDocument?.issued_at || new Date());
      if (!d) return '';
      return String(d.getUTCFullYear());
    },
  },
  {
    key: 'expiry_date',
    label: 'Expiry Date',
    group: 'document',
    example: 'September 11, 2026',
    build: (ctx) => {
      if (!ctx.issuedDocument?.expires_at) return '';
      const d = toLocalTime(ctx.issuedDocument.expires_at);
      if (!d) return '';
      return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    },
  },

  // ---------------------------------------------------------------------------
  // Barangay Group
  // ---------------------------------------------------------------------------
  {
    key: 'barangay_name',
    label: 'Barangay Name',
    group: 'barangay',
    example: 'Barangay 11',
    build: () => config.jurisdiction.barangayName(),
  },
  {
    key: 'barangay_name_upper',
    label: 'Barangay Name (Uppercase)',
    group: 'barangay',
    example: 'BARANGAY 11',
    build: () => config.jurisdiction.barangayName().toUpperCase(),
  },
  {
    key: 'city_municipality',
    label: 'City / Municipality Name',
    group: 'barangay',
    example: 'Malaybalay',
    build: () => config.jurisdiction.cityMunicipality(),
  },
  {
    key: 'province',
    label: 'Province Name',
    group: 'barangay',
    example: 'Bukidnon',
    build: () => config.jurisdiction.province(),
  },
  {
    key: 'office_name',
    label: 'Office Name',
    group: 'barangay',
    example: 'Office of the Barangay Captain',
    build: (ctx) => ctx.settings?.office_name || 'Office of the Barangay Captain',
  },
  {
    key: 'captain_name',
    label: 'Barangay Captain Name',
    group: 'barangay',
    example: 'Hon. Juan dela Cruz',
    build: (ctx) => ctx.settings?.barangay_captain || '',
  },
  {
    key: 'secretary_name',
    label: 'Barangay Secretary Name',
    group: 'barangay',
    example: 'Maria Santos',
    build: (ctx) => ctx.settings?.barangay_secretary || '',
  },
];

const ALLOWED_PLACEHOLDER_KEYS = Object.freeze(PLACEHOLDER_CATALOG.map((p) => p.key));
const PLACEHOLDER_MAP = Object.freeze(
  PLACEHOLDER_CATALOG.reduce((acc, cur) => {
    acc[cur.key] = cur;
    return acc;
  }, {})
);

/**
 * Builds a snapshot render_data object containing ONLY allowlisted keys
 */
function buildRenderData(context) {
  const result = {};
  for (const entry of PLACEHOLDER_CATALOG) {
    try {
      const rawValue = entry.build(context);
      result[entry.key] = sanitizeXmlString(rawValue);
    } catch {
      result[entry.key] = '';
    }
  }
  return result;
}

/**
 * Builds example render_data from catalog examples
 */
function buildExampleRenderData() {
  const result = {};
  for (const entry of PLACEHOLDER_CATALOG) {
    result[entry.key] = sanitizeXmlString(entry.example);
  }
  return result;
}

module.exports = {
  PLACEHOLDER_CATALOG,
  ALLOWED_PLACEHOLDER_KEYS,
  PLACEHOLDER_MAP,
  buildRenderData,
  buildExampleRenderData,
  sanitizeXmlString,
};
