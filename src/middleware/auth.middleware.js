const { verifyToken } = require('../modules/auth/auth.helper');
const { getDatabase } = require('../config/db');

function authenticateUser(req, res, next) {
  let token = null;

  // Check Bearer authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Check cookie if not found in header
  if (!token && req.cookies && req.cookies.quickfile_token) {
    token = req.cookies.quickfile_token;
  }

  // Check session fallback
  if (!token && req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  if (!token) {
    // If request wants json API
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }
    // Redirect to landing page or specific login
    return res.redirect('/?error=' + encodeURIComponent('Please log in to continue'));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Session expired or invalid token. Please log in again.' });
    }
    return res.redirect('/?error=' + encodeURIComponent('Session expired. Please log in again.'));
  }

  // Verify active status from database
  const db = getDatabase();
  const user = db.prepare('SELECT id, email, role, full_name, phone, is_active FROM users WHERE id = ?').get(decoded.id);

  if (!user) {
    return res.status(401).json({ success: false, message: 'User account not found.' });
  }

  if (!user.is_active) {
    if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Barangay Administrator.' });
    }
    return res.redirect('/?error=' + encodeURIComponent('Your account is deactivated. Contact Administrator.'));
  }

  req.user = user;
  if (req.session) {
    req.session.user = user;
  }
  res.locals.currentUser = user;
  next();
}

module.exports = {
  authenticateUser
};
