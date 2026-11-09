const {
  DocumentRequest,
  DocumentType,
  DocumentTemplate,
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
const { getDateRanges, escapeRegex } = require('../../utils/dateUtil');
const { buildRenderData } = require('../../utils/templatePlaceholders');
const { verifyTemplateFileIntegrity } = require('../../utils/templateStorage');
const { renderDocx } = require('../admin/documentTypes/documentTemplates.service');
const reportsService = require('../reports/reports.service');

/**
 * Get Staff Dashboard KPIs and pending queue
 * Item 13: Uses shared date util with APP_TIMEZONE_OFFSET_MINUTES
 */
async function getDashboardKPIs() {
  const { startOfToday } = getDateRanges();

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
      released_at: { $gte: startOfToday },
    }),
    DocumentRequest.countDocuments({
      status: REQUEST_STATUSES.REJECTED,
      rejected_at: { $gte: startOfToday },
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
  const [pending, under_review, in_preparation, ready_for_pickup] = await Promise.all([
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.PENDING }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.UNDER_REVIEW }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.IN_PREPARATION }),
    DocumentRequest.countDocuments({ status: REQUEST_STATUSES.READY_FOR_PICKUP }),
  ]);

  return {
    pending,
    under_review,
    in_preparation,
    ready_for_pickup,
    timestamp: new Date().toISOString(),
  };
}

/**
 * List requests for staff review with filters, search, and pagination
 * Item 4 & 11: Supports status as single string, comma-separated, or array
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

  if (status) {
    if (Array.isArray(status)) {
      const valid = status.filter((s) => Object.values(REQUEST_STATUSES).includes(s));
      query.status = valid.length > 0 ? { $in: valid } : { $in: ['__none__'] };
    } else if (typeof status === 'string' && status.includes(',')) {
      const valid = status
        .split(',')
        .map((s) => s.trim())
        .filter((s) => Object.values(REQUEST_STATUSES).includes(s));
      query.status = valid.length > 0 ? { $in: valid } : { $in: ['__none__'] };
    } else if (typeof status === 'string' && Object.values(REQUEST_STATUSES).includes(status)) {
      query.status = status;
    } else if (typeof status === 'object' && status.$in) {
      query.status = status;
    }
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

    query.$or = [{ tracking_number: regex }, { citizen_id: { $in: userIds } }];
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
  const citizenProfile = await CitizenProfile.findOne({
    user_id: request.citizen_id?._id || request.citizen_id,
  }).lean();

  // Fetch IssuedDocument if already issued
  const issuedDocument = await IssuedDocument.findOne({ request_id: request._id }).lean();

  return {
    request,
    citizen_profile: citizenProfile,
    issued_document: issuedDocument,
  };
}

/**
 * Append internal processing note
 */
async function appendStaffNotes(requestId, noteText, actorUser, ipAddress, userAgent) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    const error = new Error('Note text is required.');
    error.statusCode = 400;
    throw error;
  }

  const trimmed = noteText.trim();
  if (trimmed.length > 500) {
    const error = new Error('Note text cannot exceed 500 characters.');
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
  const formattedNote = `[${timestamp}] ${actorUser.full_name}: ${trimmed}`;
  const existingNotes = request.processing_notes ? `${request.processing_notes}\n` : '';
  const newNotes = `${existingNotes}${formattedNote}`;

  if (newNotes.length > 1000) {
    const error = new Error('Processing notes exceed the maximum total length of 1000 characters.');
    error.statusCode = 400;
    throw error;
  }

  request.processing_notes = newNotes;
  await request.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'REQUEST_NOTE_APPEND',
    module: 'REQUEST',
    target_id: request._id.toString(),
    target_type: 'DocumentRequest',
    details: {
      tracking_number: request.tracking_number,
      note_length: trimmed.length,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    processing_notes: request.processing_notes,
    appended_note: formattedNote,
  };
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
 * Transition pending/under_review/approved -> rejected (Item 13)
 */
async function rejectRequest(requestId, rejectionReason, actorUser, ipAddress, userAgent) {
  if (!rejectionReason || typeof rejectionReason !== 'string') {
    const error = new Error('Rejection reason must be between 5 and 500 characters.');
    error.statusCode = 400;
    throw error;
  }

  const trimmed = rejectionReason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    const error = new Error('Rejection reason must be between 5 and 500 characters.');
    error.statusCode = 400;
    throw error;
  }

  const request = await DocumentRequest.findById(requestId).populate('citizen_id', 'email full_name');
  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  const rejectableStatuses = [
    REQUEST_STATUSES.PENDING,
    REQUEST_STATUSES.UNDER_REVIEW,
    REQUEST_STATUSES.APPROVED,
  ];

  if (!rejectableStatuses.includes(request.status)) {
    const error = new Error(
      `Request cannot be rejected from status "${request.status}". Only pending, under_review, or approved requests can be rejected.`
    );
    error.statusCode = 400;
    throw error;
  }

  const updated = await transitionRequestStatus({
    requestId,
    expectedStatus: request.status,
    newStatus: REQUEST_STATUSES.REJECTED,
    actorUser,
    rejectionReason: trimmed,
    ipAddress,
    userAgent,
  });

  // Non-blocking email notification
  if (request.citizen_id && request.citizen_id.email) {
    sendMail({
      to: request.citizen_id.email,
      subject: `QuickFile: Document Request Update (${request.tracking_number})`,
      html: `
        <h2>Document Request Rejected</h2>
        <p>Dear ${request.citizen_id.full_name},</p>
        <p>Your document request <strong>${request.tracking_number}</strong> has been rejected.</p>
        <p><strong>Reason:</strong> ${trimmed}</p>
        <p>If you have any questions, please contact the Barangay Hall.</p>
      `,
    }).catch((err) => {
      console.warn('[StaffService] Failed to send rejection email:', err.message);
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
 * Issue document: in_preparation -> ready_for_pickup
 * Item 13: Idempotent - if IssuedDocument already exists for this request, reuse it
 * Item 10: CERTIFICATE_VALIDITY_DAYS 0 means no expiry; remove docType.validity_days branch
 * Item 7: QR code uses config.publicAppUrl
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

  const [citizenProfile, appSettings] = await Promise.all([
    CitizenProfile.findOne({ user_id: citizen._id }).lean(),
    AppSetting.find({}).lean(),
  ]);

  const settingsMap = {};
  for (const s of appSettings) {
    settingsMap[s.key] = s.value;
  }

  // Determine active template if custom mode is enabled
  let templateId = null;
  let templateVersion = null;
  let activeTemplate = null;

  if (docType.template_mode === 'custom' && docType.active_template_id) {
    activeTemplate = await DocumentTemplate.findById(docType.active_template_id).lean();
    if (activeTemplate && !activeTemplate.retired_at) {
      templateId = activeTemplate._id;
      templateVersion = activeTemplate.version;
    }
  }

  // Idempotency: reuse existing IssuedDocument if already created
  let issuedDoc = await IssuedDocument.findOne({ request_id: request._id });

  let certificateNumber;
  let verificationCode;
  let qrData;
  let qrCodeImage;
  let expiresAt = null;
  let issuedAt = new Date();

  if (issuedDoc) {
    certificateNumber = issuedDoc.certificate_number;
    verificationCode = issuedDoc.verification_code;
    qrData = issuedDoc.qr_data;
    qrCodeImage = issuedDoc.qr_code_image;
    expiresAt = issuedDoc.expires_at;
    issuedAt = issuedDoc.issued_at || issuedAt;
  } else {
    // 1. Generate unique certificate number
    certificateNumber = await generateUniqueCertificateNumber(docType.code);

    // 2. Generate random cryptographic verification code (>= 20 chars, independent of tracking number)
    verificationCode = generateVerificationCode();

    // 3. Generate QR code pointing to public verification endpoint using config.publicAppUrl
    qrData = `${config.publicAppUrl}/verify/${verificationCode}`;
    qrCodeImage = await generateQrCodeDataUrl(qrData);

    // 4. Calculate expiration (0 = no expiry; remove docType.validity_days branch)
    if (config.certificateValidityDays > 0) {
      expiresAt = new Date(Date.now() + config.certificateValidityDays * 24 * 60 * 60 * 1000);
    }
  }

  // Build snapshot render_data from allowlisted catalog
  const renderContext = {
    citizen,
    citizenProfile,
    request,
    documentType: docType,
    settings: settingsMap,
    issuedDocument: {
      certificate_number: certificateNumber,
      verification_code: verificationCode,
      qr_data: qrData,
      issued_at: issuedAt,
      expires_at: expiresAt,
    },
  };
  const renderData = buildRenderData(renderContext);

  if (!issuedDoc) {
    // 5. Create IssuedDocument with snapshot render_data and template metadata
    issuedDoc = await IssuedDocument.create({
      request_id: request._id,
      certificate_number: certificateNumber,
      document_name: docType.name,
      issued_to_name: citizen.full_name,
      verification_code: verificationCode,
      qr_data: qrData,
      qr_code_image: qrCodeImage,
      issued_by: actorUser._id,
      issued_at: issuedAt,
      validity_status: VALIDITY_STATUSES.VALID,
      expires_at: expiresAt,
      template_id: templateId,
      template_version: templateVersion,
      render_data: renderData,
    });
  } else {
    // Backfill snapshot data if missing
    if (!issuedDoc.render_data) {
      issuedDoc.render_data = renderData;
      issuedDoc.template_id = templateId;
      issuedDoc.template_version = templateVersion;
      await issuedDoc.save();
    }
  }

  // Calculate non-blocking data_warnings: keys used by active template whose values are empty
  const dataWarnings = [];
  if (activeTemplate && Array.isArray(activeTemplate.placeholders_found)) {
    for (const key of activeTemplate.placeholders_found) {
      const val = renderData[key];
      if (val === undefined || val === null || val.trim() === '') {
        dataWarnings.push(key);
      }
    }
  }

  // 6. Transition request status to ready_for_pickup atomically (with rollback on error)
  const updatedRequest = await transitionRequestStatus({
    requestId: request._id,
    expectedStatus: REQUEST_STATUSES.IN_PREPARATION,
    newStatus: REQUEST_STATUSES.READY_FOR_PICKUP,
    actorUser,
    ipAddress,
    userAgent,
  });

  // 7. Non-blocking email notification to citizen
  if (citizen && citizen.email) {
    sendMail({
      to: citizen.email,
      subject: `QuickFile: Your Document is Ready for Pickup (${request.tracking_number})`,
      html: `
        <h2>Document Ready for Pickup</h2>
        <p>Dear ${citizen.full_name},</p>
        <p>Your requested document <strong>${docType.name}</strong> (Tracking #: ${request.tracking_number}) is now ready for pickup at the Barangay Hall.</p>
        <p><strong>Certificate No:</strong> ${issuedDoc.certificate_number}</p>
        <p>Please present a valid ID upon claiming.</p>
      `,
    }).catch((err) => {
      console.warn('[StaffService] Failed to send ready_for_pickup email:', err.message);
    });
  }

  return {
    request: updatedRequest,
    issued_document: issuedDoc,
    data_warnings: dataWarnings,
  };
}

/**
 * Retrieve data required for printing official document
 * Only allowed when status is ready_for_pickup or released
 * Part 2 Item A: Returns 409 if signatories are unconfigured
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

  const liveCaptain = (settingsMap.barangay_captain || '').trim();
  const liveSecretary = (settingsMap.barangay_secretary || '').trim();

  // Snapshot rule:
  // Signatory snapshot decision:
  // We prioritize the signatory names captured in render_data snapshot at issue time to preserve historical integrity.
  // We fall back to the live settings value ONLY if the snapshot value is empty string/unconfigured.
  const rd = issuedDocument.render_data;

  const captain = (rd && rd.captain_name && rd.captain_name.trim()) ? rd.captain_name : liveCaptain;
  const secretary = (rd && rd.secretary_name && rd.secretary_name.trim()) ? rd.secretary_name : liveSecretary;

  if (!captain || !secretary) {
    const error = new Error(
      'Cannot print certificate: Signatories (Barangay Captain and Secretary) are not configured. Please configure them in Settings before printing.'
    );
    error.statusCode = 409;
    throw error;
  }

  // When snapshot render_data exists, use ONLY snapshot fields (no field-by-field fallback to live citizen data)
  if (rd) {
    return {
      barangay: {
        barangay_name: rd.barangay_name || '',
        city_municipality: rd.city_municipality || '',
        province: rd.province || '',
        office_name: rd.office_name || '',
        captain_name: captain,
        secretary_name: secretary,
      },
      citizen: {
        full_name: rd.full_name || '',
        email: request.citizen_id.email,
        phone: request.citizen_id.phone,
        address: rd.address || '',
        purok_zone: rd.purok_zone || '',
        civil_status: rd.civil_status || '',
        birthdate: citizenProfile?.birthdate || null,
        voter_status: citizenProfile?.voter_status || '',
      },
      document: {
        name: rd.document_name || '',
        code: rd.document_code || '',
        purpose: rd.purpose || '',
        copies: rd.copies || 1,
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
        template_id: issuedDocument.template_id || null,
        template_version: issuedDocument.template_version || null,
        render_data: issuedDocument.render_data,
      },
    };
  }

  // Legacy certificates issued without render_data use live data
  return {
    barangay: {
      barangay_name: config.jurisdiction.barangayName(),
      city_municipality: config.jurisdiction.cityMunicipality(),
      province: config.jurisdiction.province(),
      office_name: settingsMap.office_name || 'Office of the Barangay Captain',
      captain_name: captain,
      secretary_name: secretary,
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
      template_id: issuedDocument.template_id || null,
      template_version: issuedDocument.template_version || null,
      render_data: null,
    },
  };
}

/**
 * Release document request: ready_for_pickup -> released
 * Item 5: Explicit payment fields on DocumentRequest
 */
async function releaseRequest(requestId, paymentData, actorUser, ipAddress, userAgent) {
  const request = await DocumentRequest.findById(requestId);
  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== REQUEST_STATUSES.READY_FOR_PICKUP) {
    const error = new Error('Status changed or request was modified by another user. Please refresh.');
    error.statusCode = 409;
    throw error;
  }

  const { payment_status, payment_reference, waiver_reason } = paymentData || {};
  const extraUpdates = {};

  if (request.fee > 0) {
    if (!payment_status) {
      const error = new Error(
        'Payment confirmation is required for fee-bearing documents. Specify payment_status as "paid" or "waived".'
      );
      error.statusCode = 400;
      throw error;
    }

    if (payment_status === PAYMENT_STATUSES.PAID) {
      extraUpdates.payment_status = PAYMENT_STATUSES.PAID;
      extraUpdates.paid_at = new Date();
      extraUpdates.payment_reference = String(payment_reference || '').trim();
      extraUpdates.payment_recorded_by = actorUser._id;
    } else if (payment_status === PAYMENT_STATUSES.WAIVED) {
      if (!waiver_reason || !String(waiver_reason).trim()) {
        const error = new Error('A waiver_reason is required when payment is waived.');
        error.statusCode = 400;
        throw error;
      }
      extraUpdates.payment_status = PAYMENT_STATUSES.WAIVED;
      extraUpdates.paid_at = new Date();
      extraUpdates.waiver_reason = String(waiver_reason).trim();
      extraUpdates.payment_recorded_by = actorUser._id;
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
 * Item 4: Default is released and archived only; pending and under_review never appear
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
  let filterStatus = { $in: allowedStatuses };

  if (status) {
    let requested = [];
    if (Array.isArray(status)) {
      requested = status;
    } else if (typeof status === 'string' && status.includes(',')) {
      requested = status.split(',').map((s) => s.trim());
    } else if (typeof status === 'string') {
      requested = [status.trim()];
    }

    const filtered = requested.filter((s) => allowedStatuses.includes(s));
    if (filtered.length > 0) {
      filterStatus = filtered.length === 1 ? filtered[0] : { $in: filtered };
    } else {
      filterStatus = { $in: ['__none__'] };
    }
  }

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
 * Item 12: Passes actorUser so AuditLog records the staff member as actor
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
    actorUser,
    ipAddress,
    userAgent,
  });
}

/**
 * Generate official certificate DOCX for a document request
 * Only ready_for_pickup or released requests
 * Item 7: Docxtemplater rendering with QR image replacement
 */
async function generateCertificateDocx(requestId, actorUser, ipAddress, userAgent) {
  const request = await DocumentRequest.findById(requestId)
    .populate('document_type_id')
    .populate('citizen_id')
    .lean();

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  // Request status check: only ready_for_pickup or released
  if (
    request.status !== REQUEST_STATUSES.READY_FOR_PICKUP &&
    request.status !== REQUEST_STATUSES.RELEASED
  ) {
    const error = new Error(
      `Certificate is only available for requests with status "ready_for_pickup" or "released". Current status is "${request.status}".`
    );
    error.statusCode = 400;
    throw error;
  }

  const issuedDoc = await IssuedDocument.findOne({ request_id: request._id });
  if (!issuedDoc) {
    const error = new Error('Issued document record not found for this request.');
    error.statusCode = 404;
    throw error;
  }

  // 409 for revoked certificate
  if (issuedDoc.validity_status === VALIDITY_STATUSES.REVOKED) {
    const error = new Error('Cannot generate certificate: Certificate has been revoked.');
    error.statusCode = 409;
    throw error;
  }

  // 409 for expired certificate
  if (
    issuedDoc.validity_status === VALIDITY_STATUSES.EXPIRED ||
    (issuedDoc.expires_at && new Date(issuedDoc.expires_at) < new Date())
  ) {
    const error = new Error('Cannot generate certificate: Certificate has expired.');
    error.statusCode = 409;
    throw error;
  }

  // 409 when the certificate uses the built-in layout
  if (!issuedDoc.template_id) {
    const error = new Error(
      'Cannot generate DOCX certificate: This certificate was issued using the built-in layout. DOCX download is only available for certificates issued with custom DOCX templates.'
    );
    error.statusCode = 409;
    throw error;
  }

  // Load the template version stored on the IssuedDocument
  const template = await DocumentTemplate.findById(issuedDoc.template_id);
  if (!template) {
    console.error(
      `[StaffService] Template record ${issuedDoc.template_id} not found for issued document ${issuedDoc._id}`
    );
    const error = new Error('An unexpected server error occurred while retrieving the document template.');
    error.statusCode = 500;
    throw error;
  }

  // Verify file integrity (sha256)
  const integrity = verifyTemplateFileIntegrity(template.stored_filename, template.sha256);
  if (!integrity.exists || !integrity.matches) {
    console.error(
      `[StaffService] Template file integrity mismatch: template ${template._id} (exists=${integrity.exists}, matches=${integrity.matches})`
    );
    const error = new Error('An unexpected server error occurred while retrieving the document template.');
    error.statusCode = 500;
    throw error;
  }

  const renderData = issuedDoc.render_data || {};
  const templatePlaceholders = template.placeholders_found || [];

  // 409 for empty signatories only if the template contains captain_name or secretary_name
  if (
    templatePlaceholders.includes('captain_name') &&
    (!renderData.captain_name || !renderData.captain_name.trim())
  ) {
    const error = new Error(
      'Cannot generate certificate: Barangay Captain signatory is required by the template but is empty.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (
    templatePlaceholders.includes('secretary_name') &&
    (!renderData.secretary_name || !renderData.secretary_name.trim())
  ) {
    const error = new Error(
      'Cannot generate certificate: Barangay Secretary signatory is required by the template but is empty.'
    );
    error.statusCode = 409;
    throw error;
  }

  // Render docx (fails closed if QR placeholder swap cannot be completed)
  const renderedBuffer = await renderDocx(
    integrity.buffer,
    renderData,
    {
      qrData: issuedDoc.qr_data,
      hasQrPlaceholder: template.has_qr_placeholder,
      qrMediaPath: template.qr_media_path,
    }
  );

  // Audit log entry CERTIFICATE_DOWNLOAD (no file contents)
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'CERTIFICATE_DOWNLOAD',
    module: 'STAFF',
    target_id: issuedDoc._id.toString(),
    target_type: 'IssuedDocument',
    details: {
      request_id: request._id.toString(),
      certificate_number: issuedDoc.certificate_number,
      template_id: template._id.toString(),
      template_version: template.version,
      file_size: renderedBuffer.length,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    buffer: renderedBuffer,
    certificate_number: issuedDoc.certificate_number,
  };
}

module.exports = {
  getDashboardKPIs,
  getLiveStats,
  listStaffRequests,
  getStaffRequestDetails,
  getRequestDetails: getStaffRequestDetails,
  appendStaffNotes,
  reviewRequest,
  approveRequest,
  rejectRequest,
  prepareRequest,
  issueRequest,
  getPrintData,
  generateCertificateDocx,
  releaseRequest,
  archiveRequest,
  listRecords,
  searchResidents,
  createWalkInRequest,
};
