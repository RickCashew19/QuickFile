const path = require('path');

// Resolve the project root dynamically based on the current file location
// Ensures QuickFile runs on any machine, OS, drive, or folder structure
const projectRoot = path.resolve(__dirname, '../../');

// Always load .env relative to the project root, regardless of where the command was executed
require('dotenv').config({ path: path.join(projectRoot, '.env') });

function resolveDbPath(envPath) {
  if (!envPath || envPath.trim() === '') {
    return path.join(projectRoot, 'src', 'database', 'quickfile.db');
  }
  return path.isAbsolute(envPath) ? envPath : path.resolve(projectRoot, envPath);
}

module.exports = {
  projectRoot,
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'quickfile_default_secret_key',
  sessionSecret: process.env.SESSION_SECRET || 'quickfile_default_session_secret',
  dbPath: resolveDbPath(process.env.DB_PATH)
};
