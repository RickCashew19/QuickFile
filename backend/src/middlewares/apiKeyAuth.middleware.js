const crypto = require('crypto');
const { config } = require('../config');
const { AppSetting } = require('../models');
const { authenticate } = require('./auth.middleware');

/**
 * REST API Key Authentication Middleware
 * Enforces API Key authentication when enable_rest_api_gateway is enabled.
 * When disabled, follows alternative authentication behavior (Bearer JWT or 403 if API key used while disabled).
 */
async function apiKeyAuth(req, res, next) {
  try {
    const setting = await AppSetting.findOne({ key: 'enable_rest_api_gateway' });
    const isGatewayEnabled = Boolean(setting && (setting.value === true || setting.value === 'true'));

    const apiKeyHeader =
      req.headers['x-api-key'] ||
      (req.headers.authorization && req.headers.authorization.startsWith('ApiKey ')
        ? req.headers.authorization.slice(7).trim()
        : null);

    if (isGatewayEnabled) {
      // 1. When enabled, API key authentication is strictly enforced
      const activeKey = config.restApi.resolveSecretKey().value;
      if (!activeKey) {
        return res.status(500).json({
          success: false,
          message: 'REST API Gateway is enabled, but no API secret key is configured on the server.',
          code: 'GATEWAY_NOT_CONFIGURED',
          data: null,
        });
      }

      if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
        return res.status(401).json({
          success: false,
          message: 'Authentication required. Missing x-api-key header.',
          code: 'API_KEY_REQUIRED',
          data: null,
        });
      }

      // Timing-safe comparison of provided key vs configured secret
      const hashConfigured = crypto.createHash('sha256').update(activeKey.trim()).digest();
      const hashProvided = crypto.createHash('sha256').update(apiKeyHeader.trim()).digest();
      const isMatch = crypto.timingSafeEqual(hashConfigured, hashProvided);

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key provided.',
          code: 'API_KEY_INVALID',
          data: null,
        });
      }

      req.apiKeyClient = { authenticated: true, source: 'api_key' };
      return next();
    } else {
      // 2. When disabled, follow alternative authentication behavior
      // If client attempts to authenticate with an API key while the gateway is disabled:
      if (apiKeyHeader) {
        return res.status(403).json({
          success: false,
          message: 'REST API Gateway is currently disabled by administrator. Please use Bearer token authentication.',
          code: 'GATEWAY_DISABLED',
          data: null,
        });
      }

      // Fallback: If Bearer JWT is provided, use standard user authentication
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return authenticate(req, res, next);
      }

      // Otherwise require standard bearer authentication
      return res.status(401).json({
        success: false,
        message: 'REST API Gateway is disabled. Standard Bearer token authentication required.',
        code: 'BEARER_AUTH_REQUIRED',
        data: null,
      });
    }
  } catch (error) {
    next(error);
  }
}

module.exports = {
  apiKeyAuth,
};
