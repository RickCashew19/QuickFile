const mongoose = require('mongoose');
const { DocumentRequest, AuditLog, AppSetting } = require('../../models');
const { REQUEST_STATUSES, PAYMENT_STATUSES } = require('../../config/constants');
const { config } = require('../../config');
const { parseLocalDateRange } = require('../../utils/dateUtil');

/**
 * Validates and casts document_type_id parameter
 */
function validateDocumentTypeId(id) {
  if (!id) return null;

  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
    const error = new Error('Invalid document_type_id. Must be a 24-character hexadecimal ObjectId.');
    error.statusCode = 400;
    throw error;
  }

  return new mongoose.Types.ObjectId(id);
}

/**
 * Shared Structured Reports Service
 * Returns raw structured data conforming to the documented export view-model:
 * - summary: total_requests, released_count, rejected_count, total_revenue, waived_count, waived_amount, from, to
 * - by_document_type: document_code, document_name, count, unit_fee, collected_amount
 * - by_status: status, count
 * - staff_workload: staff_name, role, per_status, total_actions (staff & admin only; citizens excluded)
 * - transactions: items (applicant_name, document_name, document_code, tracking_number, status, fee, payment_status, payment_reference, waiver_reason, paid_at, created_at, released_at), total, page, limit, truncated, max_rows
 * - signatories: prepared_by, noted_by (omitted if not configured)
 */
async function generateReportData({
  from,
  to,
  document_type_id,
  page = 1,
  limit = 50,
  isExport = false,
  maxRows = config.exportMaxRows || 5000,
  actorUser = {},
}) {
  const { fromDate, toDate, fromDateStr, toDateStr } = parseLocalDateRange(from, to);
  const docTypeObjectId = validateDocumentTypeId(document_type_id);

  // 1. Base queries using calendar day boundaries in barangay timezone
  const createdQuery = {
    created_at: { $gte: fromDate, $lte: toDate },
  };
  if (docTypeObjectId) {
    createdQuery.document_type_id = docTypeObjectId;
  }

  const paidMatchQuery = {
    paid_at: { $gte: fromDate, $lte: toDate },
    payment_status: PAYMENT_STATUSES.PAID,
  };
  if (docTypeObjectId) {
    paidMatchQuery.document_type_id = docTypeObjectId;
  }

  const waivedMatchQuery = {
    paid_at: { $gte: fromDate, $lte: toDate },
    payment_status: PAYMENT_STATUSES.WAIVED,
  };
  if (docTypeObjectId) {
    waivedMatchQuery.document_type_id = docTypeObjectId;
  }

  // 2. Summary KPI Metrics
  const [
    total_requests,
    released_count,
    rejected_count,
    revenueAgg,
    waivedAgg,
  ] = await Promise.all([
    DocumentRequest.countDocuments(createdQuery),
    DocumentRequest.countDocuments({ ...createdQuery, status: REQUEST_STATUSES.RELEASED }),
    DocumentRequest.countDocuments({ ...createdQuery, status: REQUEST_STATUSES.REJECTED }),
    DocumentRequest.aggregate([
      { $match: paidMatchQuery },
      { $group: { _id: null, total: { $sum: '$fee' } } },
    ]),
    DocumentRequest.aggregate([
      { $match: waivedMatchQuery },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$fee' } } },
    ]),
  ]);

  const total_revenue = revenueAgg[0]?.total || 0;
  const waived_count = waivedAgg[0]?.count || 0;
  const waived_amount = waivedAgg[0]?.total || 0;

  // 3. Status Breakdown
  const statusCounts = await DocumentRequest.aggregate([
    { $match: createdQuery },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  // 4. Breakdown by Document Type
  const docTypeStats = await DocumentRequest.aggregate([
    { $match: createdQuery },
    {
      $group: {
        _id: '$document_type_id',
        count: { $sum: 1 },
        collected_amount: {
          $sum: {
            $cond: [{ $eq: ['$payment_status', PAYMENT_STATUSES.PAID] }, '$fee', 0],
          },
        },
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
        document_code: { $ifNull: ['$doc_type.code', 'UNKNOWN'] },
        document_name: { $ifNull: ['$doc_type.name', 'Unknown Document'] },
        count: 1,
        unit_fee: { $ifNull: ['$doc_type.fee', 0] },
        collected_amount: 1,
      },
    },
    { $sort: { document_name: 1 } },
  ]);

  // 5. Staff Workload: Group audit entries by actor, keeping ONLY staff and admin roles
  // Citizens' own cancellations/actions are strictly excluded via $lookup to users
  const staffWorkloadRaw = await AuditLog.aggregate([
    {
      $match: {
        action: 'REQUEST_STATUS_CHANGE',
        created_at: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'actor_user',
      },
    },
    { $unwind: '$actor_user' },
    {
      $match: {
        'actor_user.role': { $in: ['staff', 'admin'] },
      },
    },
    {
      $group: {
        _id: {
          user_id: '$user_id',
          staff_name: '$actor_user.full_name',
          role: '$actor_user.role',
          to_status: '$details.to_status',
        },
        status_count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: {
          user_id: '$_id.user_id',
          staff_name: '$_id.staff_name',
          role: '$_id.role',
        },
        per_status_array: {
          $push: {
            status: '$_id.to_status',
            count: '$status_count',
          },
        },
        total_actions: { $sum: '$status_count' },
      },
    },
    {
      $project: {
        _id: 0,
        staff_name: '$_id.staff_name',
        role: '$_id.role',
        per_status_array: 1,
        total_actions: 1,
      },
    },
    { $sort: { total_actions: -1 } },
  ]);

  // Format per_status into an object { [status]: count }
  const staff_workload = staffWorkloadRaw.map((w) => {
    const per_status = {};
    if (Array.isArray(w.per_status_array)) {
      for (const item of w.per_status_array) {
        if (item.status) {
          per_status[item.status] = item.count;
        }
      }
    }
    return {
      staff_name: w.staff_name || 'Staff Member',
      role: w.role || 'staff',
      per_status,
      total_actions: w.total_actions || 0,
    };
  });

  // 6. Paginated Transaction List
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const cap = isExport ? maxRows : 50;
  const safeLimit = Math.min(cap, Math.max(1, parseInt(limit, 10) || (isExport ? maxRows : 20)));
  const skip = (safePage - 1) * safeLimit;

  const [transactionDocs, totalTransactions] = await Promise.all([
    DocumentRequest.find(createdQuery)
      .populate('document_type_id', 'name code')
      .populate('citizen_id', 'full_name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    DocumentRequest.countDocuments(createdQuery),
  ]);

  const transactions = transactionDocs.map((r) => ({
    applicant_name: r.citizen_id?.full_name || 'Resident Citizen',
    document_name: r.document_type_id?.name || 'Document',
    document_code: r.document_type_id?.code || 'DOC',
    tracking_number: r.tracking_number,
    status: r.status,
    fee: r.fee !== undefined ? r.fee : 0,
    payment_status: r.payment_status || 'unpaid',
    payment_reference: r.payment_reference || '',
    waiver_reason: r.waiver_reason || '',
    paid_at: r.paid_at || null,
    created_at: r.created_at,
    released_at: r.released_at || null,
  }));

  const isTruncated = isExport && totalTransactions > maxRows;

  // 7. Signatories resolution from settings
  const settingsList = await AppSetting.find({
    key: { $in: ['barangay_captain', 'barangay_secretary'] },
  }).lean();
  const settingsMap = {};
  for (const s of settingsList) {
    settingsMap[s.key] = s.value;
  }

  const captainName = (settingsMap.barangay_captain || process.env.BARANGAY_CAPTAIN_NAME || '').trim();
  const secretaryName = (settingsMap.barangay_secretary || process.env.BARANGAY_SECRETARY_NAME || '').trim();
  const notedBy = secretaryName || captainName;

  return {
    summary: {
      total_requests,
      released_count,
      rejected_count,
      total_revenue,
      waived_count,
      waived_amount,
      from: fromDateStr,
      to: toDateStr,
    },
    by_document_type: docTypeStats.map((d) => ({
      document_code: d.document_code,
      document_name: d.document_name,
      count: d.count || 0,
      unit_fee: d.unit_fee || 0,
      collected_amount: d.collected_amount || 0,
    })),
    by_status: statusCounts.map((s) => ({ status: s._id, count: s.count })),
    staff_workload,
    transactions: {
      items: transactions,
      total: totalTransactions,
      page: safePage,
      limit: safeLimit,
      truncated: isTruncated,
      max_rows: maxRows,
    },
    signatories: {
      prepared_by: actorUser.full_name || 'Authorized Officer',
      noted_by: notedBy, // Only filled if configured; empty string if not configured
    },
  };
}

const { generatePdfReport } = require('./exporters/pdfExporter');
const { generateWordReport } = require('./exporters/wordExporter');
const { generateExcelReport } = require('./exporters/excelExporter');

const SUPPORTED_FORMATS = Object.freeze(['pdf', 'docx', 'xlsx']);

const CONTENT_TYPES = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

const GENERATION_TIMEOUT_MS = 15000;

/**
 * Executes report generation with a strict 15-second timeout
 */
async function generateWithTimeout(generatorFn, ...args) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error('Report generation timed out. Please narrow your date range and try again.');
      err.statusCode = 500;
      reject(err);
    }, GENERATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([generatorFn(...args), timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Export report controller entrypoint
 */
async function exportReport({ format, from, to, document_type_id, scope = 'staff', actorUser = {} }) {
  if (!format || typeof format !== 'string') {
    const error = new Error('Export format parameter is required. Supported formats: pdf, docx, xlsx.');
    error.statusCode = 400;
    throw error;
  }

  const fmt = format.toLowerCase().trim();
  if (!SUPPORTED_FORMATS.includes(fmt)) {
    const error = new Error(`Invalid export format: "${format}". Supported formats are: pdf, docx, xlsx.`);
    error.statusCode = 400;
    throw error;
  }

  // Row cap selection: 500 for PDF/Word, 5000 for Excel
  const maxRows = fmt === 'xlsx'
    ? (config.exportMaxRows || 5000)
    : (config.exportDocMaxRows || 500);

  const reportData = await generateReportData({
    from,
    to,
    document_type_id,
    isExport: true,
    maxRows,
    actorUser,
  });

  let buffer;
  try {
    if (fmt === 'pdf') {
      buffer = await generateWithTimeout(generatePdfReport, reportData, { scope, actorUser });
    } else if (fmt === 'docx') {
      buffer = await generateWithTimeout(generateWordReport, reportData, { scope, actorUser });
    } else if (fmt === 'xlsx') {
      buffer = await generateWithTimeout(generateExcelReport, reportData, { scope, actorUser });
    }
  } catch (err) {
    console.error(`[ReportExport] Generation error for format "${fmt}" (${scope} scope):`, err.message);
    const serverErr = new Error('Report generation failed due to a server error. Please try again.');
    serverErr.statusCode = 500;
    throw serverErr;
  }

  const fromDateStr = reportData.summary.from;
  const toDateStr = reportData.summary.to;
  const filename = `quickfile-report-${scope}-${fromDateStr}-to-${toDateStr}.${fmt}`;

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'REPORT_EXPORT',
    module: 'REPORTS',
    target_type: 'Report',
    details: {
      format: fmt,
      from: fromDateStr,
      to: toDateStr,
      document_type_id: document_type_id || null,
      scope,
      row_count: reportData.transactions.items.length,
      truncated: reportData.transactions.truncated,
    },
  });

  return {
    buffer,
    filename,
    contentType: CONTENT_TYPES[fmt],
    truncated: reportData.transactions.truncated,
  };
}

module.exports = {
  generateReportData,
  getStructuredReportData: generateReportData,
  exportReport,
  validateDocumentTypeId,
};