const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./src/config');
const { notFoundHandler, errorHandler } = require('./src/middleware/error.middleware');
const { apiLimiter } = require('./src/middleware/rateLimiter.middleware');

// Route imports
const authRoutes = require('./src/modules/auth/auth.routes');

const app = express();

// ==============================================================================
// 1. Security & Core Middleware
// ==============================================================================

// Set secure HTTP headers
app.use(helmet());

// CORS configuration (Strict allowlist from FRONTEND_URL per architecture requirements)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman in development)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      config.frontendUrl,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: Origin ${origin} is not allowed.`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
};
app.use(cors(corsOptions));

// HTTP Request Logger
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

// Body parsers (JSON only, no session/cookie overhead)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general API rate limiter to all /api routes
app.use('/api', apiLimiter);

// ==============================================================================
// 2. Health Check & Core Routes
// ==============================================================================

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'QuickFile REST API is healthy and operational.',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Mount modules
app.use('/api/auth', authRoutes);

// ==============================================================================
// 3. Error Handling
// ==============================================================================

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Central JSON error handler
app.use(errorHandler);

module.exports = app;

