/**
 * Normalize the Atlas `quickfile` database in place (migration + cleanup).
 *
 * Usage:
 *   node scripts/normalizeAtlas.js          # dry run (default)
 *   node scripts/normalizeAtlas.js --apply  # apply changes
 *
 * Always run scripts/backupAtlas.js first. Reads MONGODB_ADMIN_URI (or
 * MONGODB_APP_URI) from backend/.env. Never deletes accounts or requests
 * unless they are exact duplicates of a natural key (email / tracking no.).
 */
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const now = new Date();

function asString(v) { return typeof v === 'string' ? v : ''; }
function normalizedChanges(name, doc) {
  const set = {};
  const unset = [];
  const d = doc;

  // Strip injection-shaped keys from every document.
  for (const key of Object.keys(d)) {
    if (key.includes('.') || key.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(key)) unset.push(key);
  }

  switch (name) {
    case 'users':
      if (d.email && asString(d.email).toLowerCase().trim() !== d.email) set.email = asString(d.email).toLowerCase().trim();
      if (typeof d.is_active !== 'boolean') set.is_active = true;
      if (!d.full_name) set.full_name = '';
      if (!d.role) set.role = 'citizen';
      break;
    case 'documentrequests':
      if (d.status && asString(d.status).toLowerCase() !== d.status) set.status = asString(d.status).toLowerCase();
      if (!d.lock || typeof d.lock !== 'object') {
        set.lock = { is_locked: false, locked_by: null, locked_by_name: null, locked_at: null, expires_at: null };
      } else {
        for (const k of ['locked_by', 'locked_by_name', 'locked_at', 'expires_at']) {
          if (!(k in d.lock)) set[`lock.${k}`] = null;
        }
        if (typeof d.lock.is_locked !== 'boolean') {
          set['lock.is_locked'] = Boolean(
            d.lock.locked_by && d.lock.expires_at && new Date(d.lock.expires_at) > now
          );
        }
      }
      if (!('rejected_by' in d)) set.rejected_by = null;
      if (!('archived_by' in d)) set.archived_by = null;
      if (typeof d.__v !== 'number') set.__v = 0;
      break;
    case 'documenttypes':
      if (d.code && asString(d.code).trim().toUpperCase() !== d.code) set.code = asString(d.code).trim().toUpperCase();
      if (d.name && asString(d.name).trim() !== d.name) set.name = asString(d.name).trim();
      break;
    case 'appsettings':
      if (d.key && asString(d.key).toLowerCase().trim() !== d.key) set.key = asString(d.key).toLowerCase().trim();
      break;
    case 'issueddocuments':
      if (!('expires_at' in d)) set.expires_at = null;
      break;
    case 'auditlogs':
      if (d.ip_address === undefined || d.ip_address === null) set.ip_address = '';
      if (d.user_agent === undefined || d.user_agent === null) set.user_agent = '';
      break;
    case 'notifications':
      if (!d.metadata || typeof d.metadata !== 'object') set.metadata = {};
      break;
    default:
      break;
  }

  if (d.created_at === undefined || d.created_at === null) set.created_at = now;
  if ((d.updated_at === undefined || d.updated_at === null) && !['auditlogs', 'passwordresets', 'twofactorverifications'].includes(name)) set.updated_at = now;
  return { set, unset };
}

const DEDUPE = {
  users: 'email',
  documentrequests: 'tracking_number',
  documenttypes: 'code',
  issueddocuments: 'certificate_number',
  appsettings: 'key',
};

async function main() {
  const uri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_APP_URI;
  if (!uri) throw new Error('MONGODB_ADMIN_URI or MONGODB_APP_URI is missing in backend/.env');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000, tls: uri.includes('+srv') });
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  try {
    await client.connect();
    const db = client.db('quickfile');
    const names = (await db.listCollections().toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith('__'));

    for (const name of names) {
      const docs = await db.collection(name).find({}).toArray();
      const updateOps = [];
      const deleteOps = [];
      let changed = 0;
      for (const doc of docs) {
        const { set, unset } = normalizedChanges(name, doc);
        const update = {};
        if (Object.keys(set).length) update.$set = set;
        if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, '']));
        if (Object.keys(update).length) {
          updateOps.push({ updateOne: { filter: { _id: doc._id }, update } });
          changed++;
        }
      }

      let duplicates = 0;
      const keyField = DEDUPE[name];
      if (keyField) {
        const seen = new Map();
        for (const doc of docs) {
          const key = doc[keyField] === undefined || doc[keyField] === null ? null : String(doc[keyField]).toLowerCase();
          if (key === null) continue;
          const prev = seen.get(key);
          if (prev) {
            const prevTs = prev.updated_at || prev.created_at || new Date(0);
            const curTs = doc.updated_at || doc.created_at || new Date(0);
            const keep = new Date(curTs) >= new Date(prevTs) ? doc : prev;
            const drop = keep === doc ? prev : doc;
            seen.set(key, keep);
            deleteOps.push({ deleteOne: { filter: { _id: drop._id } } });
            duplicates++;
          } else {
            seen.set(key, doc);
          }
        }
      }

      console.log(`  ${name.padEnd(22)} docs=${String(docs.length).padStart(3)} normalize=${String(changed).padStart(3)} duplicates=${duplicates}`);
      // Deletes first so uniqueness-safe normalization (e.g. lowercased emails)
      // cannot collide with a duplicate that is about to be removed.
      if (APPLY && deleteOps.length) await db.collection(name).bulkWrite(deleteOps, { ordered: false });
      if (APPLY && updateOps.length) await db.collection(name).bulkWrite(updateOps, { ordered: false });
    }
    console.log(APPLY ? '\nNormalization applied.' : '\nDry run complete — no changes written.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`Normalization failed: ${err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***@')}`);
  process.exit(1);
});
