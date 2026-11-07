const {
  DocumentRequest,
  DocumentType,
  IssuedDocument,
  User,
  CitizenProfile,
  AuditLog,
  AppSetting,
} = require('../../models');
const {
  REQUEST_STATUSES,
  PAYMENT_STATUSES,
  VALIDITY_STATUSES,
  ROLES,
} = require('../../config/constants');
const { config } = require('../../config');
const { transitionRequestStatus } = require('../request/requestTransition');
const { createRequest } = require('../request/request.service');
const {
  generateUniqueCertificateNumber,
  generateVerificationCode,
  generateQrCodeDataUrl,
} = require('../../utils/certificateGenerator');
const { sendMail } = require('../../utils/mailer');

/**
 * Helper to escape regex special characters
 */
function escapeRegex(text) {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Returns Start of Day Date object
 */
function getStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get Staff Dashboard KPIs and pending queue
 */
async function getDashboardKPIs() {
  const startOfDay = getStartOfDay();

  const [
    pending,
    under_review,
    in_preparation,
    ready_for_pickup,
    today_released,
    today_rejected,
    pending_queue,
  ] = await Promise.all([
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.PENDING }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.UNDER_REVIEW }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.IN_PREPARATION }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.READY_FOR_PICKUP }),
    DocumentRequest.countDocuments({
      status: REQUEST_STATUSES.RELEASED,
      released_at: { $gte: startOfDay },
    }),
    DocumentRequest.countDocuments({
      status: REQUEST_STATUSES.REJECTED,
      rejected_at: { $gte: startOfDay },
    }),
    DocumentRequest.find({ status: REQUEST_STATUSES.PENDING })
      .sort({ created_at: 1 })
      .limit(5)
      .populate('document_type_id', 'name code processing_days fee')
      .populate('citizen_id', 'full_name email phone')
      .lean(),
  ]);

  // Urgent: requests pending or under review for more than 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const total_urgent = await DocumentRequest.countDocuments({
    status: { $in: [REQUEST_STATUSES.PENDING, REQUEST_STATUSES.UNDER_REVIEW] },
    created_at: { $lte: threeDaysAgo },
  });

  return {
    kpis: {
      pending,
      under_review,
      in_preparation,
      ready_for_pickup,
      today_released,
      today_rejected,
      total_urgent,
    },
    pending_queue,
  };
}

/**
 * Lightweight live stats for polling
 */
async function getLiveStats() {
  const startOfDay = getStartOfDay();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const [
    pending,
    under_review,
    in_preparation,
    ready_for_pickup,
    today_released,
    today_rejected,
    total_urgent,
  ] = await Promise.all([
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.PENDING }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.UNDER_REVIEW }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.IN_PREPARATION }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.READY_FOR_PICKUP }),
    DocumentRequest.countDocuments({
      status: REQUEST_STATUSES.RELEASED,
      released_at: { $gte: startOfDay },
    }),
    DocumentRequest.countDocuments({
      status: REQUEST_STATUSES.REJECTED,
      rejected_at: { $gte: startOfDay },
    }),
    DocumentRequest.countDocuments({
      status: { $in: [REQUEST_STATUSES.PENDING, REQUEST_STATUSES.UNDER_REVIEW] },
      created_at: { $lte: threeDaysAgo },
    }),
  ]);

  return {
    pending,
    under_review,
    in_preparation,
    ready_for_pickup,
    today_released,
    today_rejected,
    total_urgent,
  };
}

/**
 * List requests with filters, search, and pagination
 */
async function listStaffRequests({
  page = 1,
  limit = 20,
  status,
  document_type_id,
  from,
  to,
  search,
}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const query = {};

  if (status && Object.values(REQUEST_STATUSES).includes(status)) {
    query.status = status;
  }

  if (document_type_id) {
    query.document_type_id = document_type_id;
  }

  if (from || to) {
    query.created_at = {};
    if (from) query.created_at.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.created_at.$lte = toDate;
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    const regex = new RegExp(escapeRegex(term), 'i');

    const matchingUsers = await User.find({
      role: ROLES.CITIZEN,
      $or: [{ full_name: regex }, { email: regex }, { phone: regex }],
    }).select('_id');

    const userIds = matchingUsers.map((u) => u._id);

    query.$or = [
      { tracking_number: regex },
      { citizen_id: { $in: userIds } },
    ];
  }

  const [items, total] = await Promise.all([
    DocumentRequest.find(query)
      .populate('document_type_id', 'name code fee processing_days')
      .populate('citizen_id', 'full_name email phone')
      .populate('reviewed_by', 'full_name')
      .populate('prepared_by', 'full_name')
      .populate('approved_by', 'full_name')
      .populate('released_by', 'full_name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    DocumentRequest.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * Get single request details for staff, including notes, applicant citizen profile, and issued doc
 */
async function getStaffRequestDetails(requestIdOrTracking) {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(requestIdOrTracking);
  const filter = isObjectId ? { _id: requestIdOrTracking } : { tracking_number: requestIdOrTracking };

  const request = await DocumentRequest.findOne(filter)
    .populate('document_type_id')
    .populate('citizen_id', 'full_name email phone')
    .populate('reviewed_by', 'full_name')
    .populate('prepared_by', 'full_name')
    .populate('approved_by', 'full_name')
    .populate('released_by', 'full_name')
    .lean();

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  // Fetch applicant citizen profile
  const citizenProfile = await CitizenProfile.findOne({ user_id: request.citizen_id._id || request.citizen_id }).lean();

  // Fetch IssuedDocument if already issued
  const issuedDocument = await IssuedDocument.findOne({ request_id: request._id }).lean();

  return {
    request,
    citizen_profile: citizenProfile,
    issued_document: issuedDocument,
  };
}

/**
 * Append staff note to request processing_notes
 */
async function appendStaffNotes(requestId, noteText, actorUser, ipAddress, userAgent) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    const error = new Error('Note text is required and cannot be empty.');
    error.statusCode = 400;
    throw error;
  }

  const trimmed = noteText.trim();
  if (trimmed.length > 500) {
    const error = new Error('Individual note text cannot exceed 500 characters.');
    error.statusCode = 400;
    throw error;
  }

  const request = await DocumentRequest.findById(requestId);
  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  const timestamp = new Date().toISOString();
  const noteEntry = `[${timestamp}] ${actorUser.full_name}: ${trimmed}`;
  const existingNotes = request.processing_notes ? request.processing_notes.trim() : '';
  const combined = existingNotes ? `${existingNotes}\n${noteEntry}` : noteEntry;

  // Ensure total field does not exceed schema maximum (1000 characters)
  request.processing_notes = combined.length > 1000 ? combined.slice(-1000) : combined;
  await request.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'REQUEST_NOTE_APPEND',
    module: 'STAFF',
    target_id: request._id.toString(),
    target_type: 'DocumentRequest',
    details: { note: trimmed },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return request;
}

/**
 * Transition pending -> under_review
 */
async function reviewRequest(requestId, actorUser, ipAddress, userAgent) {
  return transitionRequestStatus({
    requestId,
    expectedStatus: REQUEST_STATUSES.PENDING,
    newStatus: REQUEST_STATUSES.UNDER_REVIEW,
    actorUser,
    ipAddress,
    userAgent,
  });
}

/**
 * Transition under_review -> approved
 */
async function approveRequest(requestId, actorUser, ipAddress, userAgent) {
  return transitionRequestStatus({
    requestId,
    expectedStatus: REQUEST_STATUSES.UNDER_REVIEW,
    newStatus: REQUEST_STATUSES.APPROVED,
    actorUser,
    ipAddress,
    userAgent,
  });
}

/**
 * Transition pending or under_review -> rejected
 */
async function rejectRequest(requestId, rejectionReason, actorUser, ipAddress, userAgent) {
  if (!rejectionReason || typeof rejectionReason !== 'string') {
    const error = new Error('Rejection reason is required.');
    error.statusCode = 400;
    throw error;
  }

  const trimmedReason = rejectionReason.trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    const error = new Error('Rejection reason must be between 5 and 500 characters.');
    error.statusCode = 400;
    throw error;
  }

  const current = await DocumentRequest.findById(requestId).populate('citizen_id');
  if (!current) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (current.status !== REQUEST_STATUSES.PENDING && current.status !== REQUEST_STATUSES.UNDER_REVIEW) {
    const error = new Error(`Request cannot be rejected from status "${current.status}". Only pending or under_review requests can be rejected.`);
    error.statusCode = 400;
    throw error;
  }

  const updated = await transitionRequestStatus({
    requestId: current._id,
    expectedStatus: current.status,
    newStatus: REQUEST_STATUSES.REJECTED,
    actorUser,
    rejectionReason: trimmedReason,
    ipAddress,
    userAgent,
  });

  // Non-blocking email notification to citizen
  if (current.citizen_id && current.citizen_id.email) {
    sendMail({
      to: current.citizen_id.email,
      subject: `QuickFile: Document Request Update (${current.tracking_number})`,
      html: `
        <h2>Document Request Rejected</h2>
        <p>Dear ${current.citizen_id.full_name},</p>
        <p>Your document request <strong>${current.tracking_number}</strong> was reviewed and could not be approved for the following reason:</p>
        <blockquote style="background:#f4f4f4;padding:10px;border-left:4px solid #d9534f;">${trimmedReason}</blockquote>
        <p>You may submit a new request with the required corrections.</p>
      `,
    }).catch((mailErr) => {
      console.warn('[Mailer] Non-blocking rejection email failed:', mailErr.message);
    });
  }

  return updated;
}

/**
 * Transition approved -> in_preparation
 */
async function prepareRequest(requestId, actorUser, ipAddress, userAgent) {
  return transitionRequestStatus({
    requestId,
    expectedStatus: REQUEST_STATUSES.APPROVED,
    newStatus: REQUEST_STATUSES.IN_PREPARATION,
    actorUser,
    ipAddress,
    userAgent,
  });
}

/**
 * Transition in_preparation -> ready_for_pickup
 * Generates IssuedDocument record, QR code, unique certificate number
 */
async function issueRequest(requestId, actorUser, ipAddress, userAgent) {
  const request = await DocumentRequest.findById(requestId)
    .populate('document_type_id')
    .populate('citizen_id');

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== REQUEST_STATUSES.IN_PREPARATION) {
    const error = new Error('Status changed or request was modified by another user. Please refresh.');
    error.statusCode = 409;
    throw error;
  }

  const docType = request.document_type_id;
  const citizen = request.citizen_id;

  // 1. Generate unique certificate number
  const certificateNumber = await generateUniqueCertificateNumber(docType.code);

  // 2. Generate random cryptographic verification code (>= 20 chars, independent of tracking number)
  const verificationCode = generateVerificationCode();

  // 3. Generate QR code pointing to public verification endpoint
  const qrData = `${config.frontendUrl}/verify/${verificationCode}`;
  const qrCodeImage = await generateQrCodeDataUrl(qrData);

  // 4. Calculate expiration
  let expiresAt = null;
  const validityDays = docType.validity_days !== undefined ? docType.validity_days : config.certificateValidityDays;
  if (validityDays > 0) {
    expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  }

  // 5. Create IssuedDocument
  const issuedDoc = await IssuedDocument.create({
    request_id: request._id,
    certificate_number: certificateNumber,
    document_name: docType.name,
    issued_to_name: citizen.full_name,
    verification_code: verificationCode,
    qr_data: qrData,
    qr_code_image: qrCodeImage,
    issued_by: actorUser._id,
    issued_at: new Date(),
    validity_status: VALIDITY_STATUSES.VALID,
    expires_at: expiresAt,
  });

  // 6. Transition request status to ready_for_pickup atomically (with rollback on error)
  let updatedRequest;
  try {
    updatedRequest = await transitionRequestStatus({
      requestId: request._id,
      expectedStatus: REQUEST_STATUSES.IN_PREPARATION,
      newStatus: REQUEST_STATUSES.READY_FOR_PICKUP,
      actorUser,
      ipAddress,
      userAgent,
    });
  } catch (transErr) {
    await IssuedDocument.deleteOne({ _id: issuedDoc._id });
    throw transErr;
  }

  // 7. Non-blocking email notification to citizen
  if (citizen && citizen.email) {
    sendMail({
      to: citizen.email,
      subject: `QuickFile: Your Document is Ready for Pickup (${request.tracking_number})`,
      html: `
        <h2>Document Ready for Pickup</h2>
        <p>Dear ${citizen.full_name},</p>
        <p>Your document (<strong>${docType.name}</strong>, Tracking #: <strong>${request.tracking_number}</strong>) is ready for pickup at the Barangay Hall.</p>
        <p>Certificate Number: <strong>${certificateNumber}</strong></p>
        <p>Please present a valid government-issued ID upon pickup.</p>
      `,
    }).catch((mailErr) => {
      console.warn('[Mailer] Non-blocking ready email failed:', mailErr.message);
    });
  }

  return {
    request: updatedRequest,
    issued_document: issuedDoc,
  };
}

/**
 * Retrieve data required for printing official document
 * Only allowed when status is ready_for_pickup or released
 */
async function getPrintData(requestId) {
  const request = await DocumentRequest.findById(requestId)
    .populate('document_type_id')
    .populate('citizen_id')
    .lean();

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (
    request.status !== REQUEST_STATUSES.READY_FOR_PICKUP &&
    request.status !== REQUEST_STATUSES.RELEASED
  ) {
    const error = new Error(
      `Print data is only available for requests with status "ready_for_pickup" or "released". Current status is "${request.status}".`
    );
    error.statusCode = 400;
    throw error;
  }

  const [citizenProfile, issuedDocument, appSettings] = await Promise.all([
    CitizenProfile.findOne({ user_id: request.citizen_id._id }).lean(),
    IssuedDocument.findOne({ request_id: request._id }).lean(),
    AppSetting.find({}).lean(),
  ]);

  if (!issuedDocument) {
    const error = new Error('Issued document record not found for this request.');
    error.statusCode = 404;
    throw error;
  }

  const settingsMap = {};
  for (const s of appSettings) {
    settingsMap[s.key] = s.value;
  }

  return {
    barangay: {
      barangay_name: config.jurisdiction.barangayName(),
      city_municipality: config.jurisdiction.cityMunicipality(),
      province: config.jurisdiction.province(),
      office_name: settingsMap.office_name || 'Office of the Barangay Captain',
      captain_name: settingsMap.barangay_captain || 'Hon. Barangay Captain',
      secretary_name: settingsMap.barangay_secretary || 'Barangay Secretary',
    },
    citizen: {
      full_name: request.citizen_id.full_name,
      email: request.citizen_id.email,
      phone: request.citizen_id.phone,
      address: citizenProfile?.street_address || '',
      purok_zone: citizenProfile?.purok_zone || '',
      civil_status: citizenProfile?.civil_status || '',
      birthdate: citizenProfile?.birthdate || null,
      voter_status: citizenProfile?.voter_status || '',
    },
    document: {
      name: request.document_type_id.name,
      code: request.document_type_id.code,
      purpose: request.purpose,
      copies: request.copies,
      fee: request.fee,
      form_data: request.form_data,
    },
    issued_document: {
      certificate_number: issuedDocument.certificate_number,
      verification_code: issuedDocument.verification_code,
      qr_data: issuedDocument.qr_data,
      qr_code_image: issuedDocument.qr_code_image,
      issued_at: issuedDocument.issued_at,
      expires_at: issuedDocument.expires_at,
    },
  };
}

/**
 * Transition ready_for_pickup -> released
 * Verifies payment confirmation if fee > 0 and atomically transitions status
 */
async function releaseRequest(requestId, paymentData = {}, actorUser, ipAddress, userAgent) {
  const request = await DocumentRequest.findById(requestId);
  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  const extraUpdates = {};

  if (request.fee > 0) {
    const { payment_status, payment_reference, waiver_reason } = paymentData;

    if (payment_status === PAYMENT_STATUSES.PAID) {
      extraUpdates.payment_status = PAYMENT_STATUSES.PAID;
      extraUpdates.paid_at = new Date();
      if (payment_reference) {
        extraUpdates['form_data.payment_reference'] = payment_reference;
      }
    } else if (payment_status === PAYMENT_STATUSES.WAIVED) {
      if (!waiver_reason || !String(waiver_reason).trim()) {
        const error = new Error('A waiver_reason is required when payment is waived.');
        error.statusCode = 400;
        throw error;
      }
      extraUpdates.payment_status = PAYMENT_STATUSES.WAIVED;
      extraUpdates.paid_at = new Date();
      extraUpdates['form_data.waiver_reason'] = String(waiver_reason).trim();
    } else {
      const error = new Error(
        'Payment confirmation is required for fee-bearing documents. Specify payment_status as "paid" or "waived".'
      );
      error.statusCode = 400;
      throw error;
    }
  } else {
    extraUpdates.payment_status = PAYMENT_STATUSES.FREE;
  }

  return transitionRequestStatus({
    requestId: request._id,
    expectedStatus: REQUEST_STATUSES.READY_FOR_PICKUP,
    newStatus: REQUEST_STATUSES.RELEASED,
    actorUser,
    extraUpdates,
    ipAddress,
    userAgent,
  });
}

/**
 * Transition released/rejected/cancelled -> archived
 */
async function archiveRequest(requestId, actorUser, ipAddress, userAgent) {
  const request = await DocumentRequest.findById(requestId);
  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  const archivableStatuses = [
    REQUEST_STATUSES.RELEASED,
    REQUEST_STATUSES.REJECTED,
    REQUEST_STATUSES.CANCELLED,
  ];

  if (!archivableStatuses.includes(request.status)) {
    const error = new Error(
      `Request cannot be archived from status "${request.status}". Only released, rejected, or cancelled requests can be archived.`
    );
    error.statusCode = 400;
    throw error;
  }

  return transitionRequestStatus({
    requestId: request._id,
    expectedStatus: request.status,
    newStatus: REQUEST_STATUSES.ARCHIVED,
    actorUser,
    ipAddress,
    userAgent,
  });
}

/**
 * List released and archived records for record-keeping
 */
async function listRecords({
  page = 1,
  limit = 20,
  status,
  document_type_id,
  from,
  to,
  search,
}) {
  const allowedStatuses = [REQUEST_STATUSES.RELEASED, REQUEST_STATUSES.ARCHIVED];
  const filterStatus = status && allowedStatuses.includes(status) ? status : { $in: allowedStatuses };

  return listStaffRequests({
    page,
    limit,
    status: filterStatus,
    document_type_id,
    from,
    to,
    search,
  });
}

/**
 * Search active citizens by name, email, or phone (min 3 chars, max 10 results)
 */
async function searchResidents(searchQuery) {
  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length < 3) {
    const error = new Error('Search query must be at least 3 characters long.');
    error.statusCode = 400;
    throw error;
  }

  const term = searchQuery.trim();
  const regex = new RegExp(escapeRegex(term), 'i');

  const residents = await User.find({
    role: ROLES.CITIZEN,
    is_active: true,
    $or: [{ full_name: regex }, { email: regex }, { phone: regex }],
  })
    .select('_id full_name email phone')
    .limit(10)
    .lean();

  return residents;
}

/**
 * Create walk-in request on behalf of a citizen
 */
async function createWalkInRequest({
  citizen_id,
  document_type_id,
  purpose,
  copies,
  form_data,
  files = [],
  actorUser,
  ipAddress,
  userAgent,
}) {
  if (!citizen_id) {
    const error = new Error('citizen_id is required for walk-in requests.');
    error.statusCode = 400;
    throw error;
  }

  const citizenUser = await User.findOne({ _id: citizen_id, role: ROLES.CITIZEN, is_active: true });
  if (!citizenUser) {
    const error = new Error('Resident citizen not found or account is inactive.');
    error.statusCode = 404;
    throw error;
  }

  return createRequest({
    citizenUser,
    documentTypeId: document_type_id,
    purpose,
    copies,
    formData: form_data,
    files,
    created_by_staff_id: actorUser._id,
    ipAddress,
    userAgent,
  });
}

/**
 * Generate aggregated reports within date range (max 366 days)
 */
async function getReports({ from, to, document_type_id }) {
  if (!from || !to) {
    const error = new Error('Both "from" and "to" date parameters are required.');
    error.statusCode = 400;
    throw error;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    const error = new Error('Invalid date format for "from" or "to". Please use ISO 8601 (YYYY-MM-DD).');
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

  const matchQuery = {
    created_at: { $gte: fromDate, $lte: toDate },
  };

  if (document_type_id) {
    matchQuery.document_type_id = document_type_id;
  }

  // Aggregate by Status
  const statusCounts = await DocumentRequest.aggregate([
    { $match: matchQuery },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  // Aggregate by Document Type
  const docTypeStats = await DocumentRequest.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$document_type_id',
        count: { $sum: 1 },
        total_fees: { $sum: '$fee' },
      },
    },
    {
      $lookup: {
        from: 'documenttypes',
        localField: '_id',
        foreignField: '_id',
        as: 'doc_type',
      },
    },
    { $unwind: { path: '$doc_type', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        document_type_id: '$_id',
        name: '$doc_type.name',
        code: '$doc_type.code',
        count: 1,
        total_fees: 1,
      },
    },
  ]);

  // Summary figures
  const total_requests = await DocumentRequest.countDocuments(matchQuery);
  const released_count = await DocumentRequest.countDocuments({
    ...matchQuery,
    status: REQUEST_STATUSES.RELEASED,
  });
  const rejected_count = await DocumentRequest.countDocuments({
    ...matchQuery,
    status: REQUEST_STATUSES.REJECTED,
  });

  const totalFeeAggregate = await DocumentRequest.aggregate([
    { $match: { ...matchQuery, payment_status: PAYMENT_STATUSES.PAID } },
    { $group: { _id: null, total: { $sum: '$fee' } } },
  ]);
  const total_revenue = totalFeeAggregate[0]?.total || 0;

  // Staff Workload Breakdown
  const staffWorkload = await User.aggregate([
    { $match: { role: { $in: [ROLES.STAFF, ROLES.ADMIN] } } },
    {
      $lookup: {
        from: 'documentrequests',
        localField: '_id',
        foreignField: 'reviewed_by',
        as: 'reviewed_requests',
      },
    },
    {
      $lookup: {
        from: 'documentrequests',
        localField: '_id',
        foreignField: 'prepared_by',
        as: 'prepared_requests',
      },
    },
    {
      $lookup: {
        from: 'documentrequests',
        localField: '_id',
        foreignField: 'released_by',
        as: 'released_requests',
      },
    },
    {
      $project: {
        staff_id: '$_id',
        full_name: '$full_name',
        role: '$role',
        reviewed_count: { $size: '$reviewed_requests' },
        prepared_count: { $size: '$prepared_requests' },
        released_count: { $size: '$released_requests' },
      },
    },
  ]);

  return {
    summary: {
      total_requests,
      released_count,
      rejected_count,
      total_revenue,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    by_document_type: docTypeStats,
    by_status: statusCounts.map((s) => ({ status: s._id, count: s.count })),
    staff_workload: staffWorkload,
  };
}

module.exports = {
  getDashboardKPIs,
  getLiveStats,
  listStaffRequests,
  getStaffRequestDetails,
  appendStaffNotes,
  reviewRequest,
  approveRequest,
  rejectRequest,
  prepareRequest,
  issueRequest,
  getPrintData,
  releaseRequest,
  archiveRequest,
  listRecords,
  searchResidents,
  createWalkInRequest,
  getReports,
};
