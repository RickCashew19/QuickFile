const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./src/config');
const { API_PREFIX } = require('./src/config/constants');
const { notFoundHandler, errorHandler } = require('./src/middleware/error.middleware');
const { apiLimiter } = require('./src/middleware/rateLimiter.middleware');
const { sanitizeNoSql } = require('./src/middleware/sanitizeNoSql.middleware');

// Route imports
const authRoutes = require('./src/modules/auth/auth.routes');
const settingsRoutes = require('./src/modules/settings/settings.routes');
const publicRoutes = require('./src/modules/public/public.routes');
const citizenRoutes = require('./src/modules/citizen/citizen.routes');
const notificationRoutes = require('./src/modules/notification/notification.routes');
const documentTypesRoutes = require('./src/modules/admin/documentTypes/documentTypes.routes');
const requestRoutes = require('./src/modules/request/request.routes');
const fileRoutes = require('./src/modules/file/file.routes');

const app = express();

if (config.trustProxy) {
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Fix 4: NoSQL injection protection on body, query, params
app.use(sanitizeNoSql);

// Apply rate limiter to all API endpoints
app.use('/api', apiLimiter);

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
app.use(`${API_PREFIX}/citizen/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/citizen/requests`, requestRoutes);
app.use(`${API_PREFIX}/citizen`, citizenRoutes);
app.use(`${API_PREFIX}/files`, fileRoutes);
app.use(`${API_PREFIX}/admin/document-types`, documentTypesRoutes);
app.use(`${API_PREFIX}/admin/settings`, settingsRoutes);
app.use(`${API_PREFIX}/public`, publicRoutes);

// ==============================================================================
// 3. Error Handling
// ==============================================================================

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
