/**
 * Live smoke test against Atlas: connectivity, replica set, validators and
 * real multi-document transactions (commit + rollback). Cleans up after itself.
 *
 *   node scripts/smokeAtlas.js
 */
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_APP_URI;
  if (!uri || !uri.includes('+srv')) throw new Error('Set MONGO_URI to the Atlas runtime URI in backend/.env first');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000, tls: true });
  try {
    await client.connect();
    const db = client.db('quickfile');
    const hello = await db.admin().command({ hello: 1 });
    console.log(`Connected to Atlas replica set: ${hello.setName}`);

    const cols = await db.listCollections().toArray();
    const validated = cols.filter((c) => c.options && c.options.validator).map((c) => c.name);
    console.log(`Collections with schema validation: ${validated.length} (${validated.join(', ')})`);

    const name = '__atlas_smoke_txn__';
    await db.createCollection(name);
    try {
      const session = client.startSession();
      await session.withTransaction(async () => {
        await db.collection(name).insertMany([{ probe: 'commit-1' }, { probe: 'commit-2' }], { session });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await session.endSession();
      const committed = await db.collection(name).countDocuments();
      console.log(`Transaction commit: ${committed === 2 ? 'OK' : 'FAILED'} (${committed} documents)`);

      const session2 = client.startSession();
      try {
        await session2.withTransaction(async () => {
          await db.collection(name).insertOne({ probe: 'rollback' }, { session: session2 });
          throw new Error('intentional rollback');
        }).catch(() => null);
      } finally {
        await session2.endSession();
      }
      const afterRollback = await db.collection(name).countDocuments();
      console.log(`Transaction rollback: ${afterRollback === 2 ? 'OK' : 'FAILED'} (${afterRollback} documents)`);
    } finally {
      await db.collection(name).drop();
    }
    console.log('Smoke test complete; temporary collection removed.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`Smoke test failed: ${err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***@')}`);
  process.exit(1);
});
