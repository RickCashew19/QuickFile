const adminService = require('./admin.service');
const staffService = require('../staff/staff.service');
const reportsService = require('../reports/reports.service');
const asyncHandler = require('../../utils/asyncHandler');

function requireDeleteConfirmation(req, res) {
  if (!req.body || req.body.confirm !== 'DELETE') {
    res.status(400).json({
      success: false,
      message: 'Confirmation required. Request body must contain { confirm: "DELETE" }.',
      data: null,
    });
    return false;
  }
  return true;
}

// ==============================================================================
// 1. Dashboard & Live Stats
// ==============================================================================

const getDashboard = asyncHandler(async (req, res) => {
  const data = await adminService.getDashboard();
  return res.status(200).json({
    success: true,
    message: 'Admin dashboard metrics retrieved successfully.',
    data,
  });
});

const getLiveStats = asyncHandler(async (req, res) => {
  const data = await adminService.getLiveStats();
  return res.status(200).json({
    success: true,
    message: 'Live stats retrieved successfully.',
    data,
  });
});

// ==============================================================================
// 2. Staff Management
// ==============================================================================

const listStaff = asyncHandler(async (req, res) => {
  const data = await adminService.listStaff(req.query);
  return res.status(200).json({
    success: true,
    message: 'Staff directory retrieved successfully.',
    data,
  });
});

const getStaffById = asyncHandler(async (req, res) => {
  const data = await adminService.getStaffById(req.params.id);
  return res.status(200).json({
    success: true,
    message: 'Staff details retrieved successfully.',
    data,
  });
});

const createStaff = asyncHandler(async (req, res) => {
  const staff = await adminService.createStaff(req.body, req.user);
  return res.status(201).json({
    success: true,
    message: 'Staff member account created successfully.',
    data: staff,
  });
});

const updateStaff = asyncHandler(async (req, res) => {
  const staff = await adminService.updateStaff(req.params.id, req.body, req.user);
  return res.status(200).json({
    success: true,
    message: 'Staff member updated successfully.',
    data: staff,
  });
});

const updateStaffStatus = asyncHandler(async (req, res) => {
  const staff = await adminService.updateStaffStatus(req.params.id, req.body, req.user);
  return res.status(200).json({
    success: true,
    message: `Staff member account ${staff.is_active ? 'activated' : 'deactivated'} successfully.`,
    data: staff,
  });
});

const updateStaffPermissions = asyncHandler(async (req, res) => {
  const permissions = await adminService.updateStaffPermissions(req.params.id, req.body, req.user);
  return res.status(200).json({
    success: true,
    message: 'Staff permissions updated successfully.',
    data: permissions,
  });
});

const resetStaffPassword = asyncHandler(async (req, res) => {
  const result = await adminService.resetStaffPassword(req.params.id, req.body.new_password, req.user);
  return res.status(200).json({
    success: true,
    message: 'Staff password reset successfully. Active sessions invalidated.',
    data: result,
  });
});

const deleteStaff = asyncHandler(async (req, res) => {
  if (!requireDeleteConfirmation(req, res)) return;
  await adminService.deleteStaff(req.params.id, req.user);
  return res.status(200).json({
    success: true,
    message: 'Staff member deleted successfully.',
    data: null,
  });
});

// ==============================================================================
// 3. Citizen Management
// ==============================================================================

const listCitizens = asyncHandler(async (req, res) => {
  const data = await adminService.listCitizens(req.query);
  return res.status(200).json({
    success: true,
    message: 'Citizen directory retrieved successfully.',
    data,
  });
});

const updateCitizenStatus = asyncHandler(async (req, res) => {
  const citizen = await adminService.updateCitizenStatus(req.params.id, req.body, req.user);
  return res.status(200).json({
    success: true,
    message: `Citizen account ${citizen.is_active ? 'activated' : 'deactivated'} successfully.`,
    data: citizen,
  });
});

const deleteCitizen = asyncHandler(async (req, res) => {
  if (!requireDeleteConfirmation(req, res)) return;
  await adminService.deleteCitizen(req.params.id, req.user);
  return res.status(200).json({
    success: true,
    message: 'Citizen account and associated request records deleted successfully.',
    data: null,
  });
});

// ==============================================================================
// 4. Requests & Records Management
// ==============================================================================

const listRecords = asyncHandler(async (req, res) => {
  const data = await staffService.listRecords(req.query);
  return res.status(200).json({
    success: true,
    message: 'Records retrieved successfully.',
    data,
  });
});

const getRequestDetails = asyncHandler(async (req, res) => {
  const data = await staffService.getRequestDetails(req.params.id);
  return res.status(200).json({
    success: true,
    message: 'Request details retrieved successfully.',
    data,
  });
});

const deleteRequest = asyncHandler(async (req, res) => {
  if (!requireDeleteConfirmation(req, res)) return;
  await adminService.deleteRequest(req.params.id, req.user);
  return res.status(200).json({
    success: true,
    message: 'Document request deleted successfully.',
    data: null,
  });
});

// ==============================================================================
// 5. Issued Documents
// ==============================================================================

const listIssuedDocuments = asyncHandler(async (req, res) => {
  const data = await adminService.listIssuedDocuments(req.query);
  return res.status(200).json({
    success: true,
    message: 'Issued documents retrieved successfully.',
    data,
  });
});

const revokeIssuedDocument = asyncHandler(async (req, res) => {
  const doc = await adminService.revokeIssuedDocument(req.params.id, req.body.reason, req.user);
  return res.status(200).json({
    success: true,
    message: 'Issued document revoked successfully.',
    data: doc,
  });
});

const reinstateIssuedDocument = asyncHandler(async (req, res) => {
  const doc = await adminService.reinstateIssuedDocument(req.params.id, req.user);
  return res.status(200).json({
    success: true,
    message: 'Issued document reinstated successfully.',
    data: doc,
  });
});

const deleteIssuedDocument = asyncHandler(async (req, res) => {
  if (!requireDeleteConfirmation(req, res)) return;
  await adminService.deleteIssuedDocument(req.params.id, req.user);
  return res.status(200).json({
    success: true,
    message: 'Issued document record deleted successfully.',
    data: null,
  });
});

// ==============================================================================
// 6. Audit Logs & Reports
// ==============================================================================

const listAuditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.listAuditLogs(req.query);
  return res.status(200).json({
    success: true,
    message: 'Audit logs retrieved successfully.',
    data,
  });
});

const getReports = asyncHandler(async (req, res) => {
  const data = await reportsService.getStructuredReportData(req.query);
  return res.status(200).json({
    success: true,
    message: 'Admin reports generated successfully.',
    data,
  });
});

const exportAdminReport = asyncHandler(async (req, res) => {
  const { format, from, to, document_type_id } = req.query;
  const result = await reportsService.exportReport({
    format,
    from,
    to,
    document_type_id,
    scope: 'admin',
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
  listStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffStatus,
  updateStaffPermissions,
  resetStaffPassword,
  deleteStaff,
  listCitizens,
  updateCitizenStatus,
  deleteCitizen,
  listRecords,
  getRequestDetails,
  deleteRequest,
  listIssuedDocuments,
  revokeIssuedDocument,
  reinstateIssuedDocument,
  deleteIssuedDocument,
  listAuditLogs,
  getReports,
  exportAdminReport,
};
