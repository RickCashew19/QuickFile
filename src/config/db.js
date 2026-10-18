const Database = require('better-sqlite3');
const path = require('path');
const config = require('./index');

let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    const resolvedPath = path.resolve(config.dbPath);
    dbInstance = new Database(resolvedPath, {
      verbose: config.nodeEnv === 'development' ? null : null
    });
    // Enable WAL mode for better concurrency and foreign keys for relational integrity
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

module.exports = {
  getDatabase
};
