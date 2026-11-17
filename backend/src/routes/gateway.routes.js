const express = require('express');
const router = express.Router();
const { apiKeyAuth } = require('../middlewares/apiKeyAuth.middleware');
const { config } = require('../config');
const { DocumentRequest, DocumentType } = require('../models');

// Mount apiKeyAuth on all gateway routes
router.use(apiKeyAuth);

/**
 * Gateway Status & Health Check
 * GET /api/v1/gateway/status
 */
router.get('/status', async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'REST API Gateway connection verified and active.',
    data: {
      gateway_enabled: true,
      auth_method: 'x-api-key',
      jurisdiction: {
        barangay: config.jurisdiction.barangayName(),
        city: config.jurisdiction.cityMunicipality(),
        province: config.jurisdiction.province(),
      },
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Verify API Key Authenticity
 * GET /api/v1/gateway/verify-key
 */
router.get('/verify-key', async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'API Key is valid and authorized.',
    data: {
      authenticated: true,
      client: req.apiKeyClient || null,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * List active document types for external systems
 * GET /api/v1/gateway/document-types
 */
router.get('/document-types', async (req, res) => {
  const documentTypes = await DocumentType.find({ is_active: true })
    .select('code name description fee processing_days requirements')
    .lean();

  return res.status(200).json({
    success: true,
    message: 'Document types retrieved via REST API Gateway.',
    data: documentTypes,
  });
});

module.exports = router;
