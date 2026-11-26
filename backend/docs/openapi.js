/**
 * OpenAPI 3.0 description of the QuickFile REST API.
 *
 * Kept as a small JS builder instead of a giant JSON literal so shared
 * parameters, responses and schemas stay defined once. Served as JSON at
 * GET /api/v1/openapi.json and rendered by Swagger UI at /api/v1/docs.
 */
const { API_PREFIX } = require('../src/config/constants');

const jsonContent = (ref) => ({
  'application/json': { schema: { $ref: `#/components/schemas/${ref}` } },
});
const errorRes = (description) => ({
  description,
  content: jsonContent('ErrorEnvelope'),
});
const okRes = (description) => ({
  description,
  content: jsonContent('SuccessEnvelope'),
});
const binaryRes = (description) => ({
  description,
  content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
});

/** Standard response set for a JSON endpoint. */
function std(description, extra = {}) {
  return {
    200: okRes(description),
    400: errorRes('Validation error'),
    401: errorRes('Authentication required or token invalid'),
    403: errorRes('Insufficient privileges'),
    404: errorRes('Resource not found'),
    429: errorRes('Rate limit exceeded'),
    500: errorRes('Internal server error'),
    ...extra,
  };
}

/** Build one operation; `body` is a schema, `params` an array of parameters. */
function op(summary, opts = {}) {
  const result = {
    summary,
    tags: [opts.tag || 'General'],
    responses: std(opts.success || 'Successful response', opts.responses),
  };
  if (opts.description) result.description = opts.description;
  // `security: []` overrides the global bearer/cookie security for public routes.
  if (opts.security !== undefined) result.security = opts.security;
  if (opts.params) result.parameters = opts.params;
  if (opts.body) {
    result.requestBody = {
      required: opts.bodyRequired !== false,
      content: { 'application/json': { schema: opts.body } },
    };
  }
  if (opts.multipart) {
    result.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              ...opts.multipart,
              attachments: {
                type: 'array',
                items: { type: 'string', format: 'binary' },
                maxItems: 3,
                description: 'Optional supporting files (max 3, 2MB each)',
              },
            },
          },
        },
      },
    };
  }
  return result;
}

const idParam = (name = 'id', description = '24-character hexadecimal ObjectId') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
});
const versionParam = {
  name: 'version',
  in: 'path',
  required: true,
  description: 'Template version number',
  schema: { type: 'integer', minimum: 1 },
};
const objectIdField = (description) => ({
  type: 'string',
  pattern: '^[0-9a-fA-F]{24}$',
  description,
});
const str = (name, description, where = 'query') => ({
  name,
  in: where,
  required: false,
  description,
  schema: { type: 'string' },
});
const integer = (name, description) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'integer', minimum: 1 },
});
const bool = (name, description) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema: { type: 'boolean' },
});
const pageParams = [
  integer('page', 'Page number (1-based)'),
  integer('limit', 'Page size'),
];
const conflict = { 409: errorRes('Conflict: invalid state transition or duplicate record') };
const locked = { 423: errorRes('Request is locked by another staff member') };

const obj = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length && { required }),
});
const strProp = (description, example) => ({ type: 'string', description, ...(example && { example }) });
const boolProp = (description) => ({ type: 'boolean', description });

const voterStatusSchema = obj(
  {
    voter_status: { type: 'string', enum: ['registered', 'unregistered'] },
  },
  ['voter_status']
);
const activeSchema = obj({ is_active: boolProp('Active state') }, ['is_active']);
const reasonSchema = obj({ reason: strProp('Reason (5-200 characters)') }, ['reason']);
const notificationReasonSchema = obj(
  { cancellation_reason: strProp('Reason for cancelling the request') },
  ['cancellation_reason']
);
const confirmDelete = obj({ confirm: { type: 'string', enum: ['DELETE'] } }, ['confirm']);

const paths = {
  '/health': {
    get: op('Health check', {
      tag: 'System',
      security: [],
      success: 'Service is healthy',
    }),
  },

  // ---- Public / authentication -------------------------------------------
  '/public/config': {
    get: op('Public app configuration', { tag: 'Public', security: [] }),
  },
  '/verify/{code}': {
    get: op('Public QR certificate verification', {
      tag: 'Public',
      security: [],
      params: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
    }),
  },
  '/auth/register': {
    post: op('Register a citizen account', {
      tag: 'Authentication',
      security: [],
      success: 'Account created',
      responses: { 201: okRes('Account created') },
      body: obj(
        {
          email: strProp('Account email'),
          password: strProp('Password'),
          first_name: strProp('First name'),
          middle_name: strProp('Middle name'),
          last_name: strProp('Last name'),
          suffix: strProp('Name suffix'),
          birthdate: { type: 'string', format: 'date' },
          gender: strProp('Gender'),
          civil_status: strProp('Civil status'),
          contact_number: strProp('Philippine mobile number'),
          purok_zone: strProp('Purok / zone'),
          street_address: strProp('Street address'),
          recaptcha_token: strProp('reCAPTCHA token, when enabled'),
        },
        ['email', 'password', 'first_name', 'last_name', 'birthdate', 'gender']
      ),
    }),
  },
  '/auth/login': {
    post: op('Log in with email and password', {
      tag: 'Authentication',
      security: [],
      body: obj(
        {
          email: strProp('Account email'),
          password: strProp('Password'),
          recaptcha_token: strProp('reCAPTCHA token, when enabled'),
        },
        ['email', 'password']
      ),
    }),
  },
  '/auth/google': {
    post: op('Log in with Google ID token', {
      tag: 'Authentication',
      security: [],
      body: obj({ id_token: strProp('Google ID token') }, ['id_token']),
    }),
  },
  '/auth/forgot-password': {
    post: op('Send password-reset email OTP', {
      tag: 'Authentication',
      security: [],
      body: obj(
        { email: strProp('Registered email address'), recaptcha_token: strProp('reCAPTCHA token') },
        ['email']
      ),
    }),
  },
  '/auth/resend-reset-otp': {
    post: op('Resend a password-reset OTP', {
      tag: 'Authentication',
      security: [],
      body: obj({ email: strProp('Registered email address') }, ['email']),
      responses: { 429: errorRes('Resend cooldown or rate limit exceeded') },
    }),
  },
  '/auth/verify-reset-otp': {
    post: op('Verify the password-reset OTP', {
      tag: 'Authentication',
      security: [],
      body: obj(
        {
          email: strProp('Registered email address'),
          code: strProp('Six-digit verification code'),
        },
        ['email', 'code']
      ),
    }),
  },
  '/auth/verify-reset-pin': {
    post: op('Legacy alias of verify-reset-otp', {
      tag: 'Authentication',
      security: [],
      body: obj(
        { email: strProp('Registered email address'), code: strProp('Verification code') },
        ['email', 'code']
      ),
    }),
  },
  '/auth/reset-password': {
    post: op('Reset a password with the post-verification token', {
      tag: 'Authentication',
      security: [],
      body: obj(
        { token: strProp('Reset authorization token'), new_password: strProp('New password') },
        ['token', 'new_password']
      ),
    }),
  },
  '/auth/refresh': {
    post: op('Rotate the refresh cookie and issue a new access token', {
      tag: 'Authentication',
      security: [{ refreshCookie: [] }],
      description: 'Uses the httpOnly quickfile_refresh cookie (path /api/v1/auth).',
    }),
  },
  '/auth/me': {
    get: op('Current user, profile and staff permissions', { tag: 'Authentication' }),
  },
  '/auth/logout': {
    post: op('Revoke the current refresh session and clear cookies', { tag: 'Authentication' }),
  },

  // ---- Shared -------------------------------------------------------------
  '/files/attachments/{filename}': {
    get: op('Download or preview a request attachment', {
      tag: 'Files',
      params: [{ name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: binaryRes('Binary attachment stream') },
    }),
  },
  '/gateway/status': {
    get: op('REST gateway connection status', {
      tag: 'REST Gateway',
      security: [{ apiKeyAuth: [] }],
    }),
  },
  '/gateway/verify-key': {
    get: op('Verify the supplied gateway API key', {
      tag: 'REST Gateway',
      security: [{ apiKeyAuth: [] }],
    }),
  },
  '/gateway/document-types': {
    get: op('List active document types for gateway clients', {
      tag: 'REST Gateway',
      security: [{ apiKeyAuth: [] }],
    }),
  },

  // ---- Citizen ------------------------------------------------------------
  '/citizen/catalog': {
    get: op('Active document types with form schema and requirements', { tag: 'Citizen' }),
  },
  '/citizen/profile': {
    get: op('Citizen profile with completeness info', { tag: 'Citizen Profile' }),
    put: op('Update citizen profile', {
      tag: 'Citizen Profile',
      body: obj({
        first_name: strProp('First name'),
        middle_name: strProp('Middle name'),
        last_name: strProp('Last name'),
        suffix: strProp('Suffix'),
        birthdate: { type: 'string', format: 'date' },
        gender: strProp('Gender'),
        civil_status: strProp('Civil status'),
        contact_number: strProp('Contact number'),
        purok_zone: strProp('Purok / zone'),
        street_address: strProp('Street address'),
        barangay: strProp('Barangay'),
        city: strProp('City / municipality'),
        province: strProp('Province'),
        occupation: strProp('Occupation'),
        emergency_contact_name: strProp('Emergency contact name'),
        emergency_contact_number: strProp('Emergency contact number'),
        valid_id_type: strProp('Valid ID type'),
        valid_id_number: strProp('Valid ID number'),
        proof_of_residency_type: strProp('Proof of residency type'),
      }),
      description: 'voter_status is barangay-managed and is ignored if submitted.',
    }),
  },
  '/citizen/profile/reuse': {
    get: op('Profile fields for pre-filling a new request', { tag: 'Citizen Profile' }),
  },
  '/citizen/requests': {
    post: op('Submit a new document request', {
      tag: 'Citizen Requests',
      success: 'Request created',
      responses: { 201: okRes('Request created'), 409: errorRes('Profile incomplete; required fields missing') },
      multipart: {
        document_type_id: strProp('Document type ObjectId'),
        purpose: strProp('Purpose of request'),
        copies: { type: 'integer', minimum: 1 },
        form_data: strProp('JSON string of template-specific field values'),
      },
    }),
    get: op('List the citizen’s requests', {
      tag: 'Citizen Requests',
      params: [...pageParams, str('status', 'Filter by request status')],
    }),
  },
  '/citizen/requests/{trackingNumber}': {
    get: op('Get a request by tracking number', {
      tag: 'Citizen Requests',
      params: [{ name: 'trackingNumber', in: 'path', required: true, schema: { type: 'string' } }],
    }),
    put: op('Edit a pending request', {
      tag: 'Citizen Requests',
      params: [{ name: 'trackingNumber', in: 'path', required: true, schema: { type: 'string' } }],
      multipart: {
        purpose: strProp('Purpose of request'),
        copies: { type: 'integer', minimum: 1 },
        form_data: strProp('JSON string of template-specific field values'),
        replace_attachments: boolProp('Replace existing attachments'),
      },
      responses: conflict,
    }),
  },
  '/citizen/requests/{trackingNumber}/status': {
    get: op('Lightweight status for live polling', {
      tag: 'Citizen Requests',
      params: [{ name: 'trackingNumber', in: 'path', required: true, schema: { type: 'string' } }],
    }),
  },
  '/citizen/requests/{trackingNumber}/cancel': {
    post: op('Cancel a pending request', {
      tag: 'Citizen Requests',
      params: [{ name: 'trackingNumber', in: 'path', required: true, schema: { type: 'string' } }],
      body: notificationReasonSchema,
      responses: conflict,
    }),
  },
  '/citizen/notifications': {
    get: op('List notifications', { tag: 'Notifications', params: pageParams }),
    delete: op('Clear all notifications', { tag: 'Notifications' }),
  },
  '/citizen/notifications/read-all': {
    patch: op('Mark all notifications as read', { tag: 'Notifications' }),
  },
  '/citizen/notifications/{id}/read': {
    patch: op('Mark one notification as read', { tag: 'Notifications', params: [idParam()] }),
  },
  '/citizen/notifications/{id}': {
    delete: op('Delete one notification', { tag: 'Notifications', params: [idParam()] }),
  },

  // ---- Staff --------------------------------------------------------------
  '/staff/requests/live-stats': {
    get: op('Live queue counters for polling', { tag: 'Staff Dashboard' }),
  },
  '/staff/dashboard': {
    get: op('Staff dashboard KPIs and pending queue', { tag: 'Staff Dashboard' }),
  },
  '/staff/requests': {
    get: op('Staff request queue', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [...pageParams, str('status', 'Filter by status'), str('search', 'Search text')],
    }),
  },
  '/staff/requests/walk-in': {
    post: op('File a request on behalf of a resident', {
      tag: 'Staff Requests',
      description: 'Requires can_prepare_documents.',
      multipart: {
        citizen_id: objectIdField('Resident user ObjectId'),
        document_type_id: objectIdField('Document type ObjectId'),
        purpose: strProp('Purpose of request'),
        copies: { type: 'integer', minimum: 1 },
        form_data: strProp('JSON string of field values'),
      },
      responses: { 409: errorRes('Resident profile incomplete') },
    }),
  },
  '/staff/requests/{id}': {
    get: op('Full request detail with citizen and notes', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
    }),
  },
  '/staff/requests/{id}/lock': {
    put: op('Acquire or renew the request edit lock', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
      responses: locked,
    }),
    get: op('Check the request lock status', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
    }),
    delete: op('Release the request lock', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests (or admin).',
      params: [idParam()],
    }),
  },
  '/staff/requests/{id}/notes': {
    post: op('Append an internal processing note', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
      body: obj({ note: strProp('Internal note text') }, ['note']),
    }),
  },
  '/staff/requests/{id}/review': {
    post: op('Start review (pending → under_review)', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
      responses: { ...conflict, ...locked },
    }),
  },
  '/staff/requests/{id}/approve': {
    post: op('Approve request (under_review → approved)', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
      responses: { ...conflict, ...locked },
    }),
  },
  '/staff/requests/{id}/reject': {
    post: op('Reject request', {
      tag: 'Staff Requests',
      description: 'Requires can_review_requests.',
      params: [idParam()],
      body: obj({ rejection_reason: strProp('Reason for rejection') }, ['rejection_reason']),
      responses: { ...conflict, ...locked },
    }),
  },
  '/staff/requests/{id}/prepare': {
    post: op('Mark request in preparation', {
      tag: 'Staff Requests',
      description: 'Requires can_prepare_documents.',
      params: [idParam()],
      responses: { ...conflict, ...locked },
    }),
  },
  '/staff/requests/{id}/issue': {
    post: op('Issue certificate (in_preparation → ready_for_pickup)', {
      tag: 'Staff Requests',
      description: 'Requires can_prepare_documents.',
      params: [idParam()],
      body: obj({ remarks: strProp('Optional issuance remarks') }),
      responses: { ...conflict, ...locked },
    }),
  },
  '/staff/requests/{id}/print-data': {
    get: op('Certificate print data and signatories', {
      tag: 'Staff Requests',
      description: 'Requires can_print_documents.',
      params: [idParam()],
    }),
  },
  '/staff/requests/{id}/certificate': {
    get: op('Download the issued certificate as DOCX', {
      tag: 'Staff Requests',
      description: 'Requires can_print_documents; limited to 30 downloads per 15 minutes.',
      params: [idParam(), str('format', 'Output format (docx)')],
      responses: {
        200: binaryRes('DOCX certificate stream'),
        429: errorRes('Download rate limit exceeded'),
      },
    }),
  },
  '/staff/requests/{id}/release': {
    post: op('Release document and record payment', {
      tag: 'Staff Requests',
      description: 'Requires can_release_documents.',
      params: [idParam()],
      body: obj(
        {
          payment_received: boolProp('Whether payment was collected'),
          or_number: strProp('Official receipt number, when applicable'),
        },
        ['payment_received']
      ),
      responses: { ...conflict, ...locked },
    }),
  },
  '/staff/requests/{id}/archive': {
    post: op('Archive a completed request', {
      tag: 'Staff Requests',
      description: 'Requires can_archive_records.',
      params: [idParam()],
      body: obj({ archive_reason: strProp('Optional archive reason') }),
      responses: conflict,
    }),
  },
  '/staff/records': {
    get: op('Historical request records', {
      tag: 'Staff Records',
      description: 'Requires can_archive_records.',
      params: [...pageParams, str('status', 'Comma-separated statuses'), str('search', 'Search text')],
    }),
  },
  '/staff/residents': {
    get: op('Resident autocomplete for walk-in filing', {
      tag: 'Staff Residents',
      description: 'Requires can_prepare_documents.',
      params: [str('search', 'Name or email search')],
    }),
  },
  '/staff/residents/{id}/voter-status': {
    patch: op('Verify a resident’s voter registration status', {
      tag: 'Staff Residents',
      description: 'Requires can_review_requests OR can_prepare_documents. Writes an audit log.',
      params: [idParam()],
      body: voterStatusSchema,
    }),
  },
  '/staff/verify/{code}': {
    get: op('Staff QR certificate verification', {
      tag: 'Staff Verification',
      description: 'Requires can_verify_qr.',
      params: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
    }),
  },
  '/staff/reports': {
    get: op('Staff reports and analytics', {
      tag: 'Staff Reports',
      description: 'Requires can_view_reports.',
      params: [str('from', 'Start date (YYYY-MM-DD)'), str('to', 'End date (YYYY-MM-DD)'), str('document_type', 'Document type filter'), str('status', 'Status filter')],
    }),
  },
  '/staff/reports/export': {
    get: op('Export staff report (PDF, DOCX or XLSX)', {
      tag: 'Staff Reports',
      description: 'Requires can_view_reports; limited to 10 exports per 15 minutes.',
      params: [
        str('format', 'pdf, docx or xlsx'),
        str('from', 'Start date (YYYY-MM-DD)'),
        str('to', 'End date (YYYY-MM-DD)'),
      ],
      responses: { 200: binaryRes('Report file stream'), 429: errorRes('Export rate limit exceeded') },
    }),
  },

  // ---- Admin --------------------------------------------------------------
  '/admin/live-stats': {
    get: op('Global live counters for polling', { tag: 'Admin System' }),
  },
  '/admin/dashboard': {
    get: op('Executive dashboard metrics', { tag: 'Admin System' }),
  },
  '/admin/staff': {
    get: op('List staff accounts', {
      tag: 'Admin Staff',
      params: [...pageParams, str('search', 'Search text'), str('is_active', 'true or false')],
    }),
    post: op('Create a staff account', {
      tag: 'Admin Staff',
      success: 'Staff account created',
      responses: { 201: okRes('Staff account created') },
      body: obj(
        {
          email: strProp('Staff email'),
          password: strProp('Initial password'),
          full_name: strProp('Full name'),
          phone: strProp('Contact number'),
          employee_id: strProp('Employee ID'),
          position: strProp('Position'),
          department: strProp('Department'),
          permissions: obj({
            can_review_requests: boolProp('Review queue access'),
            can_prepare_documents: boolProp('Prepare and issue documents'),
            can_print_documents: boolProp('Print certificates'),
            can_release_documents: boolProp('Release documents'),
            can_verify_qr: boolProp('Verify QR codes'),
            can_view_reports: boolProp('View reports'),
            can_archive_records: boolProp('Archive records'),
          }),
        },
        ['email', 'password', 'full_name']
      ),
    }),
  },
  '/admin/staff/{id}': {
    get: op('Staff account detail with permissions', { tag: 'Admin Staff', params: [idParam()] }),
    put: op('Update staff profile fields', {
      tag: 'Admin Staff',
      params: [idParam()],
      body: obj({
        full_name: strProp('Full name'),
        phone: strProp('Contact number'),
        employee_id: strProp('Employee ID'),
        position: strProp('Position'),
        department: strProp('Department'),
      }),
    }),
    delete: op('Delete a staff account (typed confirmation)', {
      tag: 'Admin Staff',
      params: [idParam()],
      body: confirmDelete,
    }),
  },
  '/admin/staff/{id}/status': {
    patch: op('Activate or deactivate a staff account', {
      tag: 'Admin Staff',
      params: [idParam()],
      body: activeSchema,
    }),
  },
  '/admin/staff/{id}/permissions': {
    put: op('Replace a staff member’s permission matrix', {
      tag: 'Admin Staff',
      params: [idParam()],
      body: obj({
        can_review_requests: boolProp('Review queue access'),
        can_prepare_documents: boolProp('Prepare and issue documents'),
        can_print_documents: boolProp('Print certificates'),
        can_release_documents: boolProp('Release documents'),
        can_verify_qr: boolProp('Verify QR codes'),
        can_view_reports: boolProp('View reports'),
        can_archive_records: boolProp('Archive records'),
      }),
    }),
  },
  '/admin/staff/{id}/reset-password': {
    post: op('Reset a staff password and revoke sessions', {
      tag: 'Admin Staff',
      params: [idParam()],
      body: obj(
        { new_password: strProp('New password (8-72 chars, letters and digits)') },
        ['new_password']
      ),
    }),
  },
  '/admin/citizens': {
    get: op('Citizen directory', {
      tag: 'Admin Citizens',
      params: [
        ...pageParams,
        str('search', 'Search text'),
        str('is_active', 'true or false'),
        str('verification_status', 'pending, verified or rejected'),
      ],
    }),
  },
  '/admin/citizens/{id}/status': {
    patch: op('Activate or deactivate a citizen account', {
      tag: 'Admin Citizens',
      params: [idParam()],
      body: activeSchema,
    }),
  },
  '/admin/citizens/{id}/voter-status': {
    patch: op('Set a citizen’s voter registration status', {
      tag: 'Admin Citizens',
      params: [idParam()],
      body: voterStatusSchema,
    }),
  },
  '/admin/citizens/{id}': {
    delete: op('Delete a citizen account and related records (typed confirmation)', {
      tag: 'Admin Citizens',
      params: [idParam()],
      body: confirmDelete,
    }),
  },
  '/admin/records': {
    get: op('Master request records', {
      tag: 'Admin Records',
      params: [
        ...pageParams,
        str('status', 'Status filter'),
        str('search', 'Search text'),
        str('from', 'Start date (YYYY-MM-DD)'),
        str('to', 'End date (YYYY-MM-DD)'),
        str('document_type_id', 'Document type ObjectId'),
      ],
    }),
  },
  '/admin/requests/{id}': {
    get: op('Full request detail', { tag: 'Admin Records', params: [idParam()] }),
    delete: op('Delete a request (typed confirmation)', {
      tag: 'Admin Records',
      params: [idParam()],
      body: confirmDelete,
    }),
  },
  '/admin/issued-documents': {
    get: op('Issued certificate registry', {
      tag: 'Admin Documents',
      params: [...pageParams, str('status', 'valid, expired or revoked'), str('search', 'Search text')],
    }),
  },
  '/admin/issued-documents/{id}/revoke': {
    post: op('Revoke an issued certificate', {
      tag: 'Admin Documents',
      params: [idParam()],
      body: reasonSchema,
      responses: conflict,
    }),
  },
  '/admin/issued-documents/{id}/reinstate': {
    post: op('Reinstate a revoked certificate', {
      tag: 'Admin Documents',
      params: [idParam()],
      responses: conflict,
    }),
  },
  '/admin/issued-documents/{id}': {
    delete: op('Delete an issued certificate record (typed confirmation)', {
      tag: 'Admin Documents',
      params: [idParam()],
      body: confirmDelete,
    }),
  },
  '/admin/audit-logs': {
    get: op('Append-only audit trail', {
      tag: 'Admin System',
      params: [
        ...pageParams,
        str('module', 'Module filter'),
        str('action', 'Action filter'),
        str('actor_name', 'Actor name search'),
        str('from', 'Start date (YYYY-MM-DD)'),
        str('to', 'End date (YYYY-MM-DD)'),
      ],
    }),
  },
  '/admin/reports': {
    get: op('Executive reports', {
      tag: 'Admin Reports',
      params: [str('from', 'Start date'), str('to', 'End date'), str('document_type_id', 'Document type ObjectId')],
    }),
  },
  '/admin/reports/export': {
    get: op('Export executive report (PDF, DOCX or XLSX)', {
      tag: 'Admin Reports',
      params: [str('format', 'pdf, docx or xlsx'), str('from', 'Start date'), str('to', 'End date'), str('document_type_id', 'Document type ObjectId')],
      responses: { 200: binaryRes('Report file stream'), 429: errorRes('Export rate limit exceeded') },
    }),
  },

  // ---- Admin document types & templates ----------------------------------
  '/admin/document-types': {
    get: op('Document type catalog', { tag: 'Admin Document Types' }),
    post: op('Create a document type', {
      tag: 'Admin Document Types',
      success: 'Document type created',
      responses: { 201: okRes('Document type created') },
      body: obj({
        name: strProp('Document type name'),
        code: strProp('Short code'),
        description: strProp('Description'),
        fee: { type: 'number', minimum: 0 },
        processing_days: { type: 'integer', minimum: 1 },
        requirements: { type: 'array', items: { type: 'string' } },
        is_active: boolProp('Active state'),
      }),
    }),
  },
  '/admin/document-types/{id}': {
    get: op('Document type detail', { tag: 'Admin Document Types', params: [idParam()] }),
    put: op('Update a document type', { tag: 'Admin Document Types', params: [idParam()] }),
    delete: op('Delete a document type (typed confirmation)', {
      tag: 'Admin Document Types',
      params: [idParam()],
      body: confirmDelete,
    }),
  },
  '/admin/template-placeholders': {
    get: op('Available certificate template placeholders', { tag: 'Admin Templates' }),
  },
  '/admin/template-starter': {
    get: op('Download the starter DOCX template', {
      tag: 'Admin Templates',
      responses: { 200: binaryRes('Starter DOCX stream') },
    }),
  },
  '/admin/document-types/{id}/templates': {
    post: op('Upload and validate a new template version', {
      tag: 'Admin Templates',
      params: [idParam()],
      description: 'multipart/form-data: single .docx file in field `template`, max 2MB.',
    }),
    get: op('Template version history', { tag: 'Admin Templates', params: [idParam()] }),
  },
  '/admin/document-types/{id}/template-mode': {
    post: op('Switch between builtin and custom template mode', {
      tag: 'Admin Templates',
      params: [idParam()],
      body: obj({ mode: { type: 'string', enum: ['builtin', 'custom'] } }, ['mode']),
    }),
  },
  '/admin/document-types/{id}/templates/{version}/activate': {
    post: op('Activate a template version', {
      tag: 'Admin Templates',
      params: [idParam(), versionParam],
      responses: conflict,
    }),
  },
  '/admin/document-types/{id}/templates/{version}/preview': {
    post: op('Render a sample certificate for preview', {
      tag: 'Admin Templates',
      params: [idParam(), versionParam],
      responses: { 200: binaryRes('Preview DOCX stream') },
    }),
  },
  '/admin/document-types/{id}/templates/{version}/file': {
    get: op('Download the original template file', {
      tag: 'Admin Templates',
      params: [idParam(), versionParam],
      responses: { 200: binaryRes('Original DOCX stream') },
    }),
  },
  '/admin/document-types/{id}/templates/{version}/retire': {
    post: op('Retire a template version', {
      tag: 'Admin Templates',
      params: [idParam(), versionParam],
      responses: conflict,
    }),
  },
  '/admin/document-types/{id}/templates/{version}': {
    delete: op('Delete an unused template version', {
      tag: 'Admin Templates',
      params: [idParam(), versionParam],
      responses: conflict,
    }),
  },

  // ---- Admin settings -----------------------------------------------------
  '/admin/settings': {
    get: op('Integration and app settings (secrets masked)', { tag: 'Admin Settings' }),
    patch: op('Update protected settings with the Super Admin key', {
      tag: 'Admin Settings',
      body: obj({
        su_admin_key: strProp('Super Admin key'),
        settings: obj({}),
        reset_keys: { type: 'array', items: { type: 'string' } },
      }),
      responses: { 401: errorRes('Invalid Super Admin key'), 423: errorRes('Super Admin key locked') },
    }),
  },
  '/admin/settings/toggles': {
    patch: op('Toggle integrations instantly', {
      tag: 'Admin Settings',
      body: obj({
        enable_google_login: boolProp('Google login'),
        enable_recaptcha: boolProp('reCAPTCHA'),
        enable_sms_notifications: boolProp('SMS notifications'),
        enable_email_notifications: boolProp('Email notifications'),
        enable_rest_api_gateway: boolProp('REST API gateway'),
      }),
    }),
  },
  '/admin/settings/general': {
    patch: op('Update general barangay information', {
      tag: 'Admin Settings',
      body: obj({
        system_name: strProp('System name'),
        contact_email: strProp('Contact email'),
        contact_phone: strProp('Contact phone'),
        office_name: strProp('Office name'),
        barangay_captain: strProp('Barangay captain'),
        barangay_secretary: strProp('Barangay secretary'),
      }),
    }),
  },
  '/admin/settings/verify-pin': {
    post: op('Verify the Super Admin PIN/key', {
      tag: 'Admin Settings',
      body: obj({ su_admin_key: strProp('Super Admin key') }),
    }),
  },
  '/admin/settings/validate-key': {
    post: op('Validate a provider API key without saving it', {
      tag: 'Admin Settings',
      description:
        'Provider credentials are probed live. Exception: reCAPTCHA site keys are only format-checked (Google has no standalone site-key verification endpoint); the reCAPTCHA secret is probed live.',
      body: obj({ provider: strProp('Provider name'), credentials: obj({}) }),
    }),
  },
  '/admin/settings/initiate-key-update': {
    post: op('Begin a protected API key update', {
      tag: 'Admin Settings',
      body: obj({ su_admin_key: strProp('Super Admin key'), provider: strProp('Provider name') }),
    }),
  },
  '/admin/settings/confirm-key-update': {
    post: op('Confirm a protected API key update', {
      tag: 'Admin Settings',
      body: obj({ verification_id: strProp('Verification id'), code: strProp('Verification code') }),
    }),
  },
};

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'QuickFile REST API',
    version: '1.0.0',
    description:
      'Barangay document request and management API. All responses use the standard `{ success, message, data }` envelope; every error also includes a stable machine-readable `code`. Browser clients authenticate with httpOnly cookies, other clients with a Bearer JWT. Admin routes require the admin role; staff routes are additionally gated by staff permissions.',
  },
  servers: [{ url: 'http://localhost:5000', description: 'Local development' }],
  tags: [
    { name: 'System', description: 'Health and diagnostics' },
    { name: 'Public', description: 'Unauthenticated endpoints' },
    { name: 'Authentication', description: 'Login, registration, session and password recovery' },
    { name: 'Files', description: 'Attachment downloads' },
    { name: 'REST Gateway', description: 'X-API-Key authenticated integrations' },
    { name: 'Citizen', description: 'Citizen document catalog' },
    { name: 'Citizen Profile', description: 'Citizen-managed profile fields' },
    { name: 'Citizen Requests', description: 'Citizen document requests' },
    { name: 'Notifications', description: 'In-app notifications' },
    { name: 'Staff Dashboard', description: 'Staff polling and KPIs' },
    { name: 'Staff Requests', description: 'Request queue and workflow' },
    { name: 'Staff Residents', description: 'Resident lookup and barangay-managed voter status' },
    { name: 'Staff Records', description: 'Historical records' },
    { name: 'Staff Verification', description: 'QR verification' },
    { name: 'Staff Reports', description: 'Staff reports and exports' },
    { name: 'Admin System', description: 'Admin dashboard, live stats and audit trail' },
    { name: 'Admin Staff', description: 'Staff account and permission management' },
    { name: 'Admin Citizens', description: 'Citizen account management' },
    { name: 'Admin Records', description: 'Master request records' },
    { name: 'Admin Documents', description: 'Issued document registry' },
    { name: 'Admin Reports', description: 'Executive reports and exports' },
    { name: 'Admin Document Types', description: 'Document type catalog management' },
    { name: 'Admin Templates', description: 'Certificate DOCX template versions' },
    { name: 'Admin Settings', description: 'Integrations and Super Admin protected settings' },
  ],
  security: [
    { bearerAuth: [] },
    { cookieAuth: [] },
  ],
  paths: Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      `${API_PREFIX}${path}`,
      methods,
    ])
  ),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token from login/refresh.',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'quickfile_session',
        description: 'httpOnly session cookie used by the browser SPA (SameSite=Strict).',
      },
      refreshCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'quickfile_refresh',
        description: 'Opaque refresh cookie, accepted only on /api/v1/auth/refresh.',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Configured REST gateway API key.',
      },
    },
    schemas: {
      SuccessEnvelope: obj(
        {
          success: { type: 'boolean', enum: [true] },
          message: { type: 'string' },
          data: { nullable: true },
        },
        ['success', 'message', 'data']
      ),
      ErrorEnvelope: obj(
        {
          success: { type: 'boolean', enum: [false] },
          message: { type: 'string' },
          code: {
            type: 'string',
            description: 'Stable machine-readable error code (e.g. VALIDATION_ERROR, LOCKED, RATE_LIMITED).',
          },
          errors: { type: 'object', nullable: true },
          data: { nullable: true },
        },
        ['success', 'message', 'code', 'data']
      ),
      Pagination: obj({
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalPages: { type: 'integer' },
      }),
    },
  },
};

module.exports = spec;
