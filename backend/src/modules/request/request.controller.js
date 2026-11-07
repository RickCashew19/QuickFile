const requestService = require('./request.service');
const { serializeCitizenRequest } = require('./request.serializer');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Submit new document request (multipart/form-data)
 * POST /api/v1/citizen/requests
 */
const createRequest = asyncHandler(async (req, res) => {
  const { document_type_id, purpose, copies, form_data } = req.body;

  if (!document_type_id || typeof document_type_id !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: document_type_id must be a valid string ID.',
      data: null,
    });
  }

  if (!purpose || typeof purpose !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Validation error: purpose must be a non-empty string.',
      data: null,
    });
  }

  const result = await requestService.createRequest({
    citizenUser: req.user,
    documentTypeId: document_type_id,
    purpose,
    copies,
    formData: form_data,
    files: req.files || [],
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(201).json({
    success: true,
    message: 'Document request submitted successfully.',
    data: serializeCitizenRequest(result),
  });
});

/**
 * List citizen requests (paginated, optional status filter)
 * GET /api/v1/citizen/requests
 */
const listRequests = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;

  const result = await requestService.listCitizenRequests(req.user._id, {
    page,
    limit,
    status,
  });

  return res.status(200).json({
    success: true,
    message: 'Document requests retrieved successfully.',
    data: {
      requests: result.requests.map(serializeCitizenRequest),
      pagination: result.pagination,
    },
  });
});

/**
 * Get single request details by tracking number (owner only)
 * GET /api/v1/citizen/requests/:trackingNumber
 */
const getRequest = asyncHandler(async (req, res) => {
  const result = await requestService.getCitizenRequest(
    req.user._id,
    req.params.trackingNumber
  );

  return res.status(200).json({
    success: true,
    message: 'Document request retrieved successfully.',
    data: serializeCitizenRequest(result),
  });
});

/**
 * Lightweight status polling endpoint
 * GET /api/v1/citizen/requests/:trackingNumber/status
 */
const getRequestStatus = asyncHandler(async (req, res) => {
  const result = await requestService.getCitizenRequestStatus(
    req.user._id,
    req.params.trackingNumber
  );

  return res.status(200).json({
    success: true,
    message: 'Document request status retrieved successfully.',
    data: result,
  });
});

/**
 * Update pending document request
 * PUT /api/v1/citizen/requests/:trackingNumber
 */
const updateRequest = asyncHandler(async (req, res) => {
  const { purpose, copies, form_data, replace_attachments } = req.body;

  const result = await requestService.updateCitizenRequest({
    citizenId: req.user._id,
    trackingNumber: req.params.trackingNumber,
    purpose,
    copies,
    formData: form_data,
    files: req.files || [],
    replaceAttachments: replace_attachments === 'true' || replace_attachments === true,
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'Document request updated successfully.',
    data: serializeCitizenRequest(result),
  });
});

/**
 * Cancel pending document request
 * POST /api/v1/citizen/requests/:trackingNumber/cancel
 */
const cancelRequest = asyncHandler(async (req, res) => {
  const { cancellation_reason } = req.body;

  const result = await requestService.cancelCitizenRequest({
    citizenId: req.user._id,
    trackingNumber: req.params.trackingNumber,
    cancellationReason: cancellation_reason,
    actorUser: req.user,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json({
    success: true,
    message: 'Document request cancelled successfully.',
    data: serializeCitizenRequest(result),
  });
});

module.exports = {
  createRequest,
  listRequests,
  getRequest,
  getRequestStatus,
  updateRequest,
  cancelRequest,
};
