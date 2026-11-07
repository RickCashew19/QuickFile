const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./src/config');
const { notFoundHandler, errorHandler } = require('./src/middleware/error.middleware');
const { apiLimiter } = require('./src/middleware/rateLimiter.middleware');

// Route imports
const authRoutes = require('./src/modules/auth/auth.routes');
const settingsRoutes = require('./src/modules/settings/settings.routes');

const app = express();

// ==============================================================================
// 1. Security & Core Middleware
// ==============================================================================

app.use(helmet());

const corsOptions = {
  origin: function (origin, callback) {
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

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api', apiLimiter);

// ==============================================================================
// 2. Health Check & API Routes
// ==============================================================================

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'QuickFile REST API is healthy and operational.',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    data: null,
  });
});

// Mounted modules
app.use('/api/auth', authRoutes);
app.use('/api/admin/settings', settingsRoutes);

// ==============================================================================
// 3. Error Handling
// ==============================================================================

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
