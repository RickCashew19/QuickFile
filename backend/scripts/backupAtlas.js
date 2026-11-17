/**
 * Full logical backup of the Atlas `quickfile` database to local JSON files.
 *
 * Usage:
 *   node scripts/backupAtlas.js [outputDirectory]
 *
 * Reads MONGODB_ADMIN_URI (falls back to MONGODB_APP_URI) from backend/.env.
 * Credentials are never printed or written to the backup.
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const COLLECTIONS = [
  'users', 'citizenprofiles', 'staffdetails', 'staffpermissions',
  'documenttypes', 'documenttemplates', 'documentrequests', 'issueddocuments',
  'notifications', 'passwordresets', 'twofactorverifications',
  'superadminlockouts', 'appsettings', 'auditlogs',
];

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(require('os').homedir(), 'quickfile-atlas-backups', new Date().toISOString().replace(/[:.]/g, '-')));
  const uri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_APP_URI;
  if (!uri) throw new Error('MONGODB_ADMIN_URI or MONGODB_APP_URI is missing in backend/.env');
  fs.mkdirSync(outDir, { recursive: true });

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000, tls: uri.includes('+srv') });
  try {
    await client.connect();
    const db = client.db('quickfile');
    let total = 0;
    for (const name of COLLECTIONS) {
      const docs = await db.collection(name).find({}).toArray();
      total += docs.length;
      fs.writeFileSync(path.join(outDir, `${name}.json`), EJSON.stringify(docs, null, 2), 'utf8');
      console.log(`  ${name}: ${docs.length}`);
    }
    const manifest = { created_at: new Date().toISOString(), database: 'quickfile', collections: COLLECTIONS.length, documents: total };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`Backup complete: ${total} documents in ${COLLECTIONS.length} collections -> ${outDir}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`Backup failed: ${err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***@')}`);
  process.exit(1);
});
