const path = require('path');
const fs = require('fs');
const config = require('./index');

let dbInstance = null;

function createNodeSqliteAdapter(resolvedPath) {
  const { DatabaseSync } = require('node:sqlite');
  const syncDb = new DatabaseSync(resolvedPath);

  // Enable WAL mode & foreign keys for relational integrity
  syncDb.exec('PRAGMA journal_mode = WAL;');
  syncDb.exec('PRAGMA foreign_keys = ON;');

  return {
    _raw: syncDb,
    exec(sql) {
      return syncDb.exec(sql);
    },
    pragma(pragmaStr) {
      const trimmed = pragmaStr.trim();
      const sql = trimmed.toUpperCase().startsWith('PRAGMA') ? trimmed : `PRAGMA ${trimmed};`;
      try {
        return syncDb.exec(sql);
      } catch (err) {
        return null;
      }
    },
    prepare(sql) {
      const stmt = syncDb.prepare(sql);
      return {
        get(...args) {
          const row = stmt.get(...args);
          if (!row) return undefined;
          return Object.assign({}, row);
        },
        all(...args) {
          const rows = stmt.all(...args);
          if (!rows || !Array.isArray(rows)) return [];
          return rows.map(r => Object.assign({}, r));
        },
        run(...args) {
          const result = stmt.run(...args);
          return {
            lastInsertRowid: Number(result.lastInsertRowid),
            changes: Number(result.changes)
          };
        }
      };
    },
    transaction(fn) {
      return function(...args) {
        syncDb.exec('BEGIN IMMEDIATE');
        try {
          const result = fn.apply(this, args);
          syncDb.exec('COMMIT');
          return result;
        } catch (err) {
          try {
            syncDb.exec('ROLLBACK');
          } catch (rErr) {}
          throw err;
        }
      };
    }
  };
}

function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = path.resolve(config.dbPath);
  const dbDir = path.dirname(resolvedPath);

  // Automatically ensure database directory exists on any host
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 1. First priority: built-in node:sqlite (native to Node.js 22.5+, 0 external compilation/C++ tools needed)
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (typeof DatabaseSync === 'function') {
      dbInstance = createNodeSqliteAdapter(resolvedPath);
      return dbInstance;
    }
  } catch (nodeSqliteErr) {
    // node:sqlite not present (e.g. running on Node <= 22.4), fall through to better-sqlite3
  }

  // 2. Second priority: better-sqlite3 (standard for environments where it is precompiled/supported)
  try {
    const Database = require('better-sqlite3');
    dbInstance = new Database(resolvedPath, {
      verbose: config.nodeEnv === 'development' ? null : null
    });
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    return dbInstance;
  } catch (betterSqliteErr) {
    throw new Error(
      `[QuickFile] SQLite database initialization failed.\n` +
      `Recommended: Use Node.js 22.5.0 or newer to use built-in zero-dependency SQLite, or install better-sqlite3 with compatible build tools.\n` +
      `Details: ${betterSqliteErr.message}`
    );
  }
}

module.exports = {
  getDatabase
};

