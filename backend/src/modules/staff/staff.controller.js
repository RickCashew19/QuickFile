const staffService = require('./staff.service');
const reportsService = require('../reports/reports.service');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Validates staff query parameters (Item 11)
 * Rejects unexpected arrays or objects, checks max lengths, integer types, and valid ISO date bounds
 */
function validateStaffListQuery(query) {
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
      const error = new Error(`Validation error: Parameter "${k}" must be a single string, not an array or object.`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (typeof query.search === 'string' && query.search.length > 100) {
    const error = new Error('Validation error: Search query cannot exceed 100 characters.');
    error.statusCode = 400;
    throw error;
  }

  if (query.page !== undefined) {
    const p = Number(query.page);
    if (!Number.isInteger(p) || p < 1) {
      const error = new Error('Validation error: "page" must be a positive integer.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (query.limit !== undefined) {
    const l = Number(query.limit);
    if (!Number.isInteger(l) || l < 1) {
      const error = new Error('Validation error: "limit" must be a positive integer.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (query.from || query.to) {
    if (query.from && isNaN(new Date(query.from).getTime())) {
      const error = new Error('Validation error: "from" date must be a valid ISO date.');
      error.statusCode = 400;
      throw error;
    }
    if (query.to && isNaN(new Date(query.to).getTime())) {
      const error = new Error('Validation error: "to" date must be a valid ISO date.');
      error.statusCode = 400;
      throw error;
    }
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      const error = new Error('Validation error: "from" date must be earlier than or equal to "to" date.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (query.document_type_id && !/^[0-9a-fA-F]{24}$/.test(query.document_type_id)) {
    const error = new Error('Validation error: document_type_id must be a valid 24-character hexadecimal ObjectId.');
    error.statusCode = 400;
    throw error;
  }
}

const getDashboard = asyncHandler(async (req, res) => {
  const result = await staffService.getDashboardKPIs();
  return res.status(200).json({
    success: true,
    message: 'Staff dashboard summary retrieved successfully.',
    data: result,
  });
});

const getLiveStats = asyncHandler(async (req, res) => {
  const result = await staffService.getLiveStats();
  return res.status(200).json({
    success: true,
    message: 'Live request stats retrieved.',
    data: result,
  });
});

const listRequests = asyncHandler(async (req, res) => {
  validateStaffListQuery(req.query);
  const { page, limit, status, document_type_id, from, to, search } = req.query;
  const result = await staffService.listStaffRequests({
    page,
    limit,
    status,
    document_type_id,
    from,
    to,
    search,
  });
  return res.status(200).json({
    success: true,
    message: 'Staff document requests retrieved successfully.',
    data: result,
  });
});

const getRequest = asyncHandler(async (req, res) => {
  const result = await staffService.getStaffRequestDetails(req.params.id);
  return res.status(200).json({
    success: true,
    message: 'Staff request details retrieved successfully.',
    data: result,
  });
});

const appendNotes = asyncHandler(async (req, res) => {
  const { notes, note } = req.body;
  const noteText = notes || note;
  const result = await staffService.appendStaffNotes(
    req.params.id,
    noteText,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Staff note appended successfully.',
    data: result,
  });
});

const reviewRequest = asyncHandler(async (req, res) => {
  const result = await staffService.reviewRequest(
    req.params.id,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Request moved to UNDER_REVIEW successfully.',
    data: result,
  });
});

const approveRequest = asyncHandler(async (req, res) => {
  const result = await staffService.approveRequest(
    req.params.id,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Request APPROVED successfully.',
    data: result,
  });
});

const rejectRequest = asyncHandler(async (req, res) => {
  const { rejection_reason } = req.body;
  const result = await staffService.rejectRequest(
    req.params.id,
    rejection_reason,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Request REJECTED successfully.',
    data: result,
  });
});

const prepareRequest = asyncHandler(async (req, res) => {
  const result = await staffService.prepareRequest(
    req.params.id,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Request moved to IN_PREPARATION successfully.',
    data: result,
  });
});

const issueRequest = asyncHandler(async (req, res) => {
  const result = await staffService.issueRequest(
    req.params.id,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Document issued successfully and marked READY_FOR_PICKUP.',
    data: result,
  });
});

const getPrintData = asyncHandler(async (req, res) => {
  const result = await staffService.getPrintData(req.params.id);
  return res.status(200).json({
    success: true,
    message: 'Official certificate print data retrieved successfully.',
    data: result,
  });
});

const downloadCertificate = asyncHandler(async (req, res) => {
  const { format } = req.query;
  if (format && format !== 'docx') {
    return res.status(400).json({
      success: false,
      message: 'Invalid or unsupported format. Only format=docx is supported.',
      data: null,
    });
  }

  const { buffer, certificate_number } = await staffService.generateCertificateDocx(
    req.params.id,
    req.user,
    req.ip,
    req.get('User-Agent')
  );

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="certificate-${certificate_number}.docx"`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(buffer);
});

const releaseRequest = asyncHandler(async (req, res) => {
  const result = await staffService.releaseRequest(
    req.params.id,
    req.body,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Document request RELEASED successfully.',
    data: result,
  });
});

const archiveRequest = asyncHandler(async (req, res) => {
  const result = await staffService.archiveRequest(
    req.params.id,
    req.user,
    req.ip,
    req.get('User-Agent')
  );
  return res.status(200).json({
    success: true,
    message: 'Document request ARCHIVED successfully.',
    data: result,
  });
});

const listRecords = asyncHandler(async (req, res) => {
  validateStaffListQuery(req.query);
  const { page, limit, status, document_type_id, from, to, search } = req.query;
  const result = await staffService.listRecords({
    page,
    limit,
    status,
    document_type_id,
    from,
    to,
    search,
  });
  return res.status(200).json({
    success: true,
    message: 'Archived and released records retrieved successfully.',
    data: result,
  });
});

const searchResidents = asyncHandler(async (req, res) => {
  if (Array.isArray(req.query.search) || (typeof req.query.search === 'object' && req.query.search !== null)) {
    return res.status(400).json({
      success: false,
      message: 'Validation error: search parameter must be a single string.',
      data: null,
    });
  }
  const { search } = req.query;
  const result = await staffService.searchResidents(search);
  return res.status(200).json({
    success: true,
    message: 'Matching resident citizens retrieved.',
    data: result,
  });
});

const createWalkIn = asyncHandler(async (req, res) => {
  const { citizen_id, document_type_id, purpose, copies, form_data } = req.body;
  const result = await staffService.createWalkInRequest({
    citizen_id,
    document_type_id,
    purpose,
    copies,
    form_data,
    files: req.files || [],
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
  return res.status(201).json({
    success: true,
    message: 'Walk-in document request created successfully.',
    data: result,
  });
});

const getReports = asyncHandler(async (req, res) => {
  const { from, to, document_type_id, page, limit } = req.query;
  const result = await reportsService.generateReportData({
    from,
    to,
    document_type_id,
    page,
    limit,
  });
  return res.status(200).json({
    success: true,
    message: 'Aggregated reports generated successfully.',
    data: result,
  });
});

const exportStaffReport = asyncHandler(async (req, res) => {
  const { format, from, to, document_type_id } = req.query;
  const result = await reportsService.exportReport({
    format,
    from,
    to,
    document_type_id,
    scope: 'staff',
    actorUser: req.user,
  });

  if (result.truncated) {
    res.setHeader('X-Export-Truncated', 'true');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  return res.status(200).send(result.buffer);
});

module.exports = {
  getDashboard,
  getLiveStats,
  listRequests,
  getRequest,
  appendNotes,
  reviewRequest,
  approveRequest,
  rejectRequest,
  prepareRequest,
  issueRequest,
  getPrintData,
  downloadCertificate,
  releaseRequest,
  archiveRequest,
  listRecords,
  searchResidents,
  createWalkIn,
  getReports,
  exportStaffReport,
};
