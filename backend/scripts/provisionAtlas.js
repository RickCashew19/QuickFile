/**
 * Provision Atlas: schema validation + indexes + TTL policies.
 *
 * Usage:
 *   node scripts/provisionAtlas.js          # dry run (default)
 *   node scripts/provisionAtlas.js --apply  # apply changes
 *
 * Reads MONGODB_ADMIN_URI (falls back to MONGODB_APP_URI) from backend/.env.
 * The runtime app user must already exist (create/change it in the Atlas UI).
 */
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const PRUNE_REDUNDANT = process.argv.includes('--prune-redundant');

// Minimal, lenient validators: enforce types on critical fields only. Existing
// documents are checked before application and must all match.
const VALIDATORS = {
  users: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'full_name', 'role', 'is_active'],
      properties: {
        email: { bsonType: 'string' },
        full_name: { bsonType: 'string' },
        role: { bsonType: 'string', enum: ['admin', 'staff', 'citizen'] },
        is_active: { bsonType: 'bool' },
      },
    },
  },
  documentrequests: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['tracking_number', 'status', 'citizen_id', 'document_type_id'],
      properties: {
        tracking_number: { bsonType: 'string' },
        status: { bsonType: 'string' },
        lock: {
          bsonType: 'object',
          properties: { is_locked: { bsonType: 'bool' } },
        },
        citizen_id: { bsonType: 'objectId' },
        document_type_id: { bsonType: 'objectId' },
        cancelled_by: { bsonType: ['objectId', 'null'] },
      },
    },
  },
  issueddocuments: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['request_id', 'certificate_number', 'verification_code'],
      properties: {
        request_id: { bsonType: 'objectId' },
        certificate_number: { bsonType: 'string' },
        verification_code: { bsonType: 'string' },
      },
    },
  },
  documenttypes: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'code'],
      properties: {
        name: { bsonType: 'string' },
        code: { bsonType: 'string' },
      },
    },
  },
  appsettings: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['key'],
      properties: { key: { bsonType: 'string' } },
    },
  },
  auditlogs: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['action', 'module'],
      properties: {
        action: { bsonType: 'string' },
        module: { bsonType: 'string' },
      },
    },
  },
  notifications: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'title', 'message'],
      properties: {
        user_id: { bsonType: 'objectId' },
        title: { bsonType: 'string' },
        message: { bsonType: 'string' },
      },
    },
  },
  citizenprofiles: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'first_name', 'last_name'],
      properties: {
        user_id: { bsonType: 'objectId' },
        first_name: { bsonType: 'string' },
        last_name: { bsonType: 'string' },
      },
    },
  },
  staffdetails: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id'],
      properties: {
        user_id: { bsonType: 'objectId' },
        employee_id: { bsonType: 'string' },
      },
    },
  },
  staffpermissions: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id'],
      properties: { user_id: { bsonType: 'objectId' } },
    },
  },
  documenttemplates: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['document_type_id', 'version'],
      properties: {
        document_type_id: { bsonType: 'objectId' },
        version: { bsonType: 'number' },
      },
    },
  },
  passwordresets: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'email', 'token_hash', 'expires_at'],
      properties: {
        user_id: { bsonType: 'objectId' },
        email: { bsonType: 'string' },
        token_hash: { bsonType: 'string' },
        expires_at: { bsonType: 'date' },
      },
    },
  },
  refreshtokens: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'family_id', 'token_hash', 'expires_at', 'absolute_expires_at'],
      properties: {
        user_id: { bsonType: 'objectId' },
        family_id: { bsonType: 'string' },
        token_hash: { bsonType: 'string' },
        expires_at: { bsonType: 'date' },
        absolute_expires_at: { bsonType: 'date' },
      },
    },
  },
  twofactorverifications: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'email', 'code_hash', 'expires_at'],
      properties: {
        user_id: { bsonType: 'objectId' },
        email: { bsonType: 'string' },
        code_hash: { bsonType: 'string' },
        expires_at: { bsonType: 'date' },
      },
    },
  },
  superadminlockouts: {
    $jsonSchema: {
      bsonType: 'object',
      properties: {
        scope: { bsonType: ['string', 'null'] },
        failed_attempts: { bsonType: 'number' },
        locked_until: { bsonType: ['date', 'null'] },
      },
    },
  },
};

// name -> [index spec, options]
const INDEXES = {
  users: [
    [{ email: 1 }, { unique: true, name: 'email_unique' }],
    [{ created_at: -1 }, { name: 'created_at_desc' }],
  ],
  citizenprofiles: [
    [{ user_id: 1 }, { unique: true, name: 'user_id_unique' }],
    [{ created_at: -1 }, { name: 'created_at_desc' }],
  ],
  staffdetails: [[{ user_id: 1 }, { unique: true, name: 'user_id_unique' }]],
  staffpermissions: [[{ user_id: 1 }, { unique: true, name: 'user_id_unique' }]],
  documenttypes: [
    [{ code: 1 }, { unique: true, name: 'code_unique' }],
    [{ created_at: -1 }, { name: 'created_at_desc' }],
  ],
  documenttemplates: [
    [{ document_type_id: 1, version: 1 }, { unique: true, name: 'doctype_version_unique' }],
    [{ document_type_id: 1, is_active: 1 }, { name: 'doctype_active' }],
  ],
  documentrequests: [
    [{ tracking_number: 1 }, { unique: true, name: 'tracking_number_unique' }],
    [{ citizen_id: 1, status: 1 }, { name: 'citizen_status' }],
    [{ 'lock.locked_by': 1 }, { name: 'lock_holder' }],
    [{ 'lock.expires_at': 1 }, { name: 'lock_expiry' }],
    [{ created_at: -1 }, { name: 'created_at_desc' }],
  ],
  issueddocuments: [
    [{ request_id: 1 }, { unique: true, name: 'request_id_unique' }],
    [{ certificate_number: 1 }, { unique: true, name: 'certificate_number_unique' }],
    [{ verification_code: 1 }, { unique: true, name: 'verification_code_unique' }],
    [{ validity_status: 1, expires_at: 1 }, { name: 'validity_expiry' }],
  ],
  notifications: [
    [{ user_id: 1, is_read: 1 }, { name: 'user_unread' }],
    [{ created_at: -1 }, { name: 'created_at_desc' }],
  ],
  passwordresets: [
    [{ token_hash: 1 }, { unique: true, name: 'token_hash_unique' }],
    // Native TTL: expired reset records purge themselves.
    [{ expires_at: 1 }, { expireAfterSeconds: 0, name: 'reset_ttl' }],
  ],
  refreshtokens: [
    [{ token_hash: 1 }, { unique: true, name: 'refresh_token_hash_unique' }],
    [{ family_id: 1, revoked_at: 1 }, { name: 'refresh_family_revoked' }],
    // Native TTL: expired sessions purge themselves (sliding idle window).
    [{ expires_at: 1 }, { expireAfterSeconds: 0, name: 'refresh_ttl' }],
  ],
  twofactorverifications: [
    [{ user_id: 1, action: 1 }, { name: 'user_action' }],
    [{ expires_at: 1 }, { expireAfterSeconds: 0, name: 'twofa_ttl' }],
  ],
  superadminlockouts: [[{ scope: 1 }, { unique: true, name: 'scope_unique', partialFilterExpression: { scope: { $type: 'string' } } }]],
  appsettings: [[{ key: 1 }, { unique: true, name: 'key_unique' }]],
  auditlogs: [[{ created_at: -1 }, { name: 'created_at_desc' }]],
};

async function checkRuntimeWriteAccess(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000, tls: uri.includes('+srv') });
  try {
    await client.connect();
    const col = client.db('quickfile').collection('__provision_write_probe__');
    await col.insertOne({ probe: true, created_at: new Date() });
    await col.drop();
    return 'OK (readWrite on quickfile)';
  } catch (e) {
    return `FAILED: ${e.message}`;
  } finally {
    await client.close();
  }
}

async function main() {
  const uri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_APP_URI;
  if (!uri) throw new Error('MONGODB_ADMIN_URI or MONGODB_APP_URI is missing in backend/.env');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000, tls: uri.includes('+srv') });
  try {
    await client.connect();
    const db = client.db('quickfile');
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Runtime user write access: ${await checkRuntimeWriteAccess(process.env.MONGODB_APP_URI || uri)}\n`);

    console.log('--- Schema validation ---');
    for (const [name, validator] of Object.entries(VALIDATORS)) {
      const invalid = await db.collection(name).countDocuments({ $nor: [validator] });
      if (invalid) {
        console.log(`  ${name}: SKIP — ${invalid} existing document(s) do not match validator (run normalizeAtlas.js first)`);
        continue;
      }
      if (APPLY) {
        await db.command({ collMod: name, validator, validationLevel: 'moderate', validationAction: 'error' });
      }
      console.log(`  ${name}: ${APPLY ? 'validator applied' : 'would apply validator'} (all documents valid)`);
    }

    console.log('\n--- Indexes ---');
    for (const [name, specs] of Object.entries(INDEXES)) {
      const existing = await db.collection(name).indexes();
      for (const [keys, opts] of specs) {
        const wanted = {
          keys,
          unique: Boolean(opts.unique),
          expireAfterSeconds: opts.expireAfterSeconds,
          partialFilterExpression: opts.partialFilterExpression || null,
        };
        const found = existing.find((idx) =>
          JSON.stringify(idx.key) === JSON.stringify(keys) &&
          Boolean(idx.unique) === wanted.unique &&
          (idx.expireAfterSeconds ?? null) === (wanted.expireAfterSeconds ?? null) &&
          JSON.stringify(idx.partialFilterExpression || null) === JSON.stringify(wanted.partialFilterExpression)
        );
        if (found) {
          console.log(`  ${name}: ${JSON.stringify(keys)} already present (${found.name})`);
          continue;
        }
        try {
          if (APPLY) await db.collection(name).createIndex(keys, opts);
          console.log(`  ${name}: ${JSON.stringify(keys)} ${JSON.stringify(opts)} ${APPLY ? 'OK' : '(dry run)'}`);
        } catch (e) {
          console.log(`  ${name}: FAILED ${e.message}`);
        }
      }
    }

    if (PRUNE_REDUNDANT) {
      console.log('\n--- Redundant indexes (prefix duplicates) ---');
      for (const name of Object.keys(INDEXES)) {
        const existing = await db.collection(name).indexes();
        for (const idx of existing) {
          if (idx.name === '_id_' || idx.unique || idx.expireAfterSeconds !== undefined) continue;
          const keys = Object.keys(idx.key);
          const covered = existing.some((other) => {
            if (other === idx || other.name === '_id_' || Boolean(other.unique) !== Boolean(idx.unique)) return false;
            const longer = Object.keys(other.key);
            if (longer.length <= keys.length) return false;
            return keys.every((k, n) => k === longer[n] && idx.key[k] === other.key[k]);
          });
          if (!covered) continue;
          if (APPLY) await db.collection(name).dropIndex(idx.name);
          console.log(`  ${name}: ${idx.name} ${APPLY ? 'dropped' : 'would drop'} (prefix of a compound index)`);
        }
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`Provisioning failed: ${err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***@')}`);
  process.exit(1);
});
