const mongoose = require('mongoose');
const { DocumentRequest, AuditLog } = require('../../models');
const { REQUEST_STATUSES, PAYMENT_STATUSES } = require('../../config/constants');
const { config } = require('../../config');

/**
 * Validates date range parameters (required, ISO 8601, from <= to, max 366 days)
 */
function validateDateRange(from, to) {
  if (!from || !to) {
    const error = new Error('Both "from" and "to" date parameters are required.');
    error.statusCode = 400;
    throw error;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    const error = new Error('Invalid date format for "from" or "to". Please use ISO 8601 (YYYY-MM-DD).');
    error.statusCode = 400;
    throw error;
  }

  toDate.setHours(23, 59, 59, 999);

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

  return { fromDate, toDate };
}

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
 * Returns raw structured data (numbers, rows, labels, no formatting)
 * Reused by Staff Reports, Admin Reports, and File Exporters (PDF, Word, Excel)
 */
async function generateReportData({
  from,
  to,
  document_type_id,
  page = 1,
  limit = 50,
  isExport = false,
  maxRows = config.exportMaxRows || 5000,
}) {
  const { fromDate, toDate } = validateDateRange(from, to);
  const docTypeObjectId = validateDocumentTypeId(document_type_id);

  // 1. Base match queries
  // created_at grouping: for status counts, by_document_type, total requests, transactions
  const createdQuery = {
    created_at: { $gte: fromDate, $lte: toDate },
  };
  if (docTypeObjectId) {
    createdQuery.document_type_id = docTypeObjectId;
  }

  // paid_at grouping: for revenue and waived fee accounting
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

  // 2. Summary counts & totals
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

  // 3. Status counts (by created_at)
  const statusCounts = await DocumentRequest.aggregate([
    { $match: createdQuery },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  // 4. By Document Type (by created_at; collected_amount from paid requests only)
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
        document_type_id: '$_id',
        name: { $ifNull: ['$doc_type.name', 'Unknown Document'] },
        code: { $ifNull: ['$doc_type.code', 'UNKNOWN'] },
        count: 1,
        collected_amount: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);

  // 5. Staff Workload Breakdown (from AuditLog REQUEST_STATUS_CHANGE entries in range)
  const staffWorkload = await AuditLog.aggregate([
    {
      $match: {
        action: 'REQUEST_STATUS_CHANGE',
        created_at: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: {
          user_id: '$user_id',
          actor_name: '$actor_name',
          to_status: '$details.to_status',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: {
          user_id: '$_id.user_id',
          actor_name: '$_id.actor_name',
        },
        statuses: {
          $push: {
            status: '$_id.to_status',
            count: '$count',
          },
        },
        total_actions: { $sum: '$count' },
      },
    },
    {
      $project: {
        user_id: '$_id.user_id',
        actor_name: '$_id.actor_name',
        total_actions: 1,
        statuses: 1,
      },
    },
    { $sort: { total_actions: -1 } },
  ]);

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
    tracking_number: r.tracking_number,
    applicant_name: r.citizen_id?.full_name || 'Resident Citizen',
    document_name: r.document_type_id?.name || 'Document',
    document_code: r.document_type_id?.code || 'DOC',
    status: r.status,
    fee: r.fee,
    payment_status: r.payment_status,
    paid_at: r.paid_at || null,
    created_at: r.created_at,
  }));

  const isTruncated = isExport && totalTransactions > maxRows;

  return {
    summary: {
      total_requests,
      released_count,
      rejected_count,
      total_revenue,
      waived_count,
      waived_amount,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    by_document_type: docTypeStats,
    by_status: statusCounts.map((s) => ({ status: s._id, count: s.count })),
    staff_workload: staffWorkload,
    transactions: {
      items: transactions,
      total: totalTransactions,
      page: safePage,
      limit: safeLimit,
      truncated: isTruncated,
      max_rows: maxRows,
    },
  };
}

module.exports = {
  generateReportData,
  getStructuredReportData: generateReportData,
  validateDateRange,
  validateDocumentTypeId,
};
