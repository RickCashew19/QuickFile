require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'quickfile_default_secret_key',
  sessionSecret: process.env.SESSION_SECRET || 'quickfile_default_session_secret',
  dbPath: process.env.DB_PATH || path.join(__dirname, '../database/quickfile.db')
};
