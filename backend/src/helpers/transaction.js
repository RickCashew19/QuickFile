const mongoose = require('mongoose');

/**
 * MongoDB multi-document transaction helper (MVCC via snapshot reads + majority
 * writes). Atlas is a replica set, so transactions are available there. Local
 * mongod is convertible to a single-node replica set; if a deployment still
 * uses a standalone server we degrade gracefully to the existing behaviour
 * instead of failing every write.
 */
let supportsTransactionsCache = null;

async function supportsTransactions() {
  if (supportsTransactionsCache !== null) return supportsTransactionsCache;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    supportsTransactionsCache = Boolean(hello.setName);
  } catch {
    supportsTransactionsCache = false;
  }
  return supportsTransactionsCache;
}

/**
 * Runs `fn(session)` inside a transaction when supported.
 * `session` is null on standalone servers, and every DB call should pass it
 * via `{ session }` (Mongoose ignores `{ session: null }`).
 */
async function withTransaction(fn) {
  if (!(await supportsTransactions())) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { withTransaction, supportsTransactions };
