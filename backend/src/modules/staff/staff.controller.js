const staffService = require('./staff.service');
const asyncHandler = require('../../utils/asyncHandler');

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
  const { from, to, document_type_id } = req.query;
  const result = await staffService.getReports({ from, to, document_type_id });
  return res.status(200).json({
    success: true,
    message: 'Aggregated reports generated successfully.',
    data: result,
  });
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
  releaseRequest,
  archiveRequest,
  listRecords,
  searchResidents,
  createWalkIn,
  getReports,
};
