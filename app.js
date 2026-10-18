const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const morgan = require('morgan');
const cors = require('cors');

const config = require('./src/config');
const { initDatabase } = require('./src/database/init');
const { errorHandler } = require('./src/middleware/error.middleware');
const { verifyToken } = require('./src/modules/auth/auth.helper');

// Initialize database schema and seeds
initDatabase();

const app = express();

// View Engine Setup (EJS)
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'ejs');

// HTTP Request Logger
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Body Parsers & CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session Support
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in HTTPS production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve Static Assets
app.use(express.static(path.join(__dirname, 'src/public')));

// Global User Context Middleware (Provides currentUser to all views)
app.use((req, res, next) => {
  let user = null;

  // 1. Check Session
  if (req.session && req.session.user) {
    user = req.session.user;
  }

  // 2. Check Cookie / Bearer Token
  const token = req.cookies?.quickfile_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
  if (!user && token) {
    const decoded = verifyToken(token);
    if (decoded) {
      user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        full_name: decoded.fullName || decoded.full_name
      };
    }
  }

  req.user = user;
  res.locals.currentUser = user;

  // Standardized Date & Time Formatting Helpers (Created At & Updated At)
  res.locals.formatDateTime = (dateVal) => {
    if (!dateVal) return 'N/A';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  res.locals.formatDate = (dateVal) => {
    if (!dateVal) return 'N/A';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  };

  // Pluggable Integration Settings (available in all views & handlers)
  const SettingsService = require('./src/modules/settings/settings.service');
  res.locals.appSettings = SettingsService.getIntegrationSettings();

  next();
});

// Root Landing Page
app.get('/', (req, res) => {
  res.render('home', {
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// REST API Gateway Enable/Disable Guard Middleware
app.use('/api', (req, res, next) => {
  // Always allow admin settings configuration endpoints so administrators can inspect and toggle settings
  if (req.path.startsWith('/admin/settings')) {
    return next();
  }

  const SettingsService = require('./src/modules/settings/settings.service');
  if (!SettingsService.isFeatureEnabled('api_enabled')) {
    return res.status(503).json({
      success: false,
      error: 'API_DISABLED',
      message: 'REST API services are currently disabled by the system administrator. Re-enable API access in Admin Settings.'
    });
  }
  next();
});

// Modular Routes Registration
// 1. Citizen Module (CIT-IAM & CIT-APM)
const citizenRoutes = require('./src/modules/citizen/citizen.routes');
app.use('/citizen', citizenRoutes);
app.use('/api/citizen', citizenRoutes);

// 2. Staff Module (STF-IAM)
const staffRoutes = require('./src/modules/staff/staff.routes');
app.use('/staff', staffRoutes);
app.use('/api/staff', staffRoutes);

// 3. Admin Module (ADM-IAM & ADM-URM)
const adminRoutes = require('./src/modules/admin/admin.routes');
app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);

// 4. App Settings & Pluggable Integrations (Admin Only)
const settingsRoutes = require('./src/modules/settings/settings.routes');
app.use('/admin/settings', settingsRoutes);
app.use('/api/admin/settings', settingsRoutes);

// 5. Verification Module (QR Code & Public Document Verification: CIT-RHV-02, STF-QDV, ADM-IDV)
const verificationRoutes = require('./src/modules/verification/verification.routes');
app.use('/verify', verificationRoutes);
app.use('/api/verify', verificationRoutes);

// Global Error Handler
app.use(errorHandler);

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(`   🚀 QuickFile Server running on http://localhost:${config.port}`);
    console.log(`   Active Modules:`);
    console.log(`   - CIT Citizen: CIT-IAM, CIT-APM, CIT-DCR, CIT-ODR, CIT-RST, CIT-RHV`);
    console.log(`   - STF Staff:   STF-IAM, STF-RVP, STF-RSM, STF-DPP, STF-RA, STF-QDV, STF-TR`);
    console.log(`   - ADM Admin:   ADM-IAM, ADM-DB, ADM-URM, ADM-DTM, ADM-TR, ADM-CRS, ADM-IDV, ADM-SAO`);
    console.log(`   - QR Verify:   http://localhost:${config.port}/verify`);
    console.log(`=======================================================`);
  });
}

module.exports = app;

