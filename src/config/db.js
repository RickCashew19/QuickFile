const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./index');

let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    const resolvedPath = path.resolve(config.dbPath);

    // Automatically create database directory if it does not exist
    const dbDir = path.dirname(resolvedPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

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
