const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./src/config');
const { API_PREFIX } = require('./src/config/constants');
const { notFoundHandler } = require('./src/middleware/notFound.middleware');
const { errorHandler } = require('./src/middleware/errorHandler.middleware');
const { sanitizeNoSql } = require('./src/middleware/sanitizeNoSql.middleware');

// Route imports
const authRoutes = require('./src/modules/auth/auth.routes');
const settingsRoutes = require('./src/modules/settings/settings.routes');
const publicRoutes = require('./src/modules/public/public.routes');
const citizenRoutes = require('./src/modules/citizen/citizen.routes');
const notificationRoutes = require('./src/modules/notification/notification.routes');
const documentTypesRoutes = require('./src/modules/admin/documentTypes/documentTypes.routes');
const requestRoutes = require('./src/modules/request/request.routes');
const staffRoutes = require('./src/modules/staff/staff.routes');
const verifyRoutes = require('./src/modules/verify/verify.routes');
const fileRoutes = require('./src/modules/file/file.routes');
const adminRoutes = require('./src/modules/admin/admin.routes');

const app = express();

// Trust Proxy Configuration (accepts true, false, or hop count)
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

// ==============================================================================
// 1. Security & Core Middleware
// ==============================================================================

app.use(helmet());

const corsOptions = {
  origin: function (origin, callback) {
    // Non-browser or same-origin requests (e.g. mobile apps, curl, server-to-server) have no origin header
    if (!origin) return callback(null, true);

    const allowedOrigins = (config.frontendUrl || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error(`CORS blocked: Origin ${origin} is not allowed.`);
      err.statusCode = 403;
      callback(err);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
};
app.use(cors(corsOptions));

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

// Strict payload limits to prevent memory exhaustion (allows 100 KB test payload to reach validator)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// NoSQL injection protection on body, query, params
app.use(sanitizeNoSql);

// ==============================================================================
// 2. Health Check & API Version 1 Routes (/api/v1)
// ==============================================================================

app.get(`${API_PREFIX}/health`, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'QuickFile REST API v1 is healthy and operational.',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    data: null,
  });
});

// Mounted modules under /api/v1/
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/verify`, verifyRoutes);
app.use(`${API_PREFIX}/citizen/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/citizen/requests`, requestRoutes);
app.use(`${API_PREFIX}/citizen`, citizenRoutes);
app.use(`${API_PREFIX}/staff`, staffRoutes);
app.use(`${API_PREFIX}/files`, fileRoutes);
app.use(`${API_PREFIX}/admin/document-types`, documentTypesRoutes);
app.use(`${API_PREFIX}/admin/settings`, settingsRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/public`, publicRoutes);

// ==============================================================================
// 3. Error Handling
// ==============================================================================

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
