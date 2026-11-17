# MongoDB Atlas runbook

The `quickfile` database is now hosted on MongoDB Atlas and is the **single source of truth**. Local app instances connect to the same Atlas database, so any write is immediately visible online — no sync service is involved.

## Credentials

Store these only in `backend/.env` (gitignored):

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` / `MONGODB_URI` | Runtime connection. Use the least-privilege app user (`readWrite` on `quickfile` only). |
| `MONGODB_ADMIN_URI` | One-off provisioning/migration scripts only. Never used by the running server. |
| `MONGODB_APP_URI` | Alternate runtime URI used by the provisioning scripts for write-access checks. |

**After initial verification, rotate both Atlas database-user passwords in the Atlas UI** (the original credentials were shared in chat and must be considered exposed). Then update the values in `.env`. Nothing in the repo contains a password.

## One-off scripts

Run from `backend/`. All default to a dry run; add `--apply` to write.

```bash
npm run atlas:backup                 # JSON backup of every collection to ~/quickfile-atlas-backups/<timestamp>
npm run atlas:normalize              # report normalization + duplicate changes
npm run atlas:normalize:apply        # apply them (run backup first)
npm run atlas:provision              # report validators / indexes / TTL
npm run atlas:provision:apply        # apply them
npm run atlas:provision:prune        # also drop prefix-redundant indexes (no data loss)
npm run atlas:smoke                  # live transaction commit/rollback check
```

Provisioning applies `$jsonSchema` validation (7 core collections), the full index set, and TTL indexes on `passwordresets.expires_at` and `twofactorverifications.expires_at` (expired rows purge themselves). Existing documents are checked against validators before they are applied, so a bad document is reported instead of silently breaking writes.

## Concurrency control

- **Pessimistic locks**: `requestLock.service.js` (`lock.is_locked` boolean + `lock.locked_by`, `lock.expires_at`), shared by every app instance through Atlas. The boolean is a readable mirror kept in sync on acquire, renew, release and status transitions; `GET /staff/requests/:id/lock` also returns top-level `is_locked`.
- **Optimistic concurrency**: `DocumentRequest` uses `__v` with Mongoose `optimisticConcurrency`; `requestTransition.js` guards on expected status and increments `__v`.
- **MVCC / transactions**: `helpers/transaction.js` uses snapshot reads + majority writes. `issueRequest` (certificate + status transition), `transitionRequestStatus` (status + audit + notification), and the password-reset flow commit atomically. On a standalone server the helper degrades gracefully (no transactions); Atlas and the local replica set run full transactions.

## Local development

Local mongod must be a replica set to support transactions:

```powershell
mongod --replSet quickfile --dbpath F:\COLLAB\QuickFile\backend\mongodb_data --bind_ip 127.0.0.1 --port 27017
mongosh "mongodb://127.0.0.1:27017/?directConnection=true" --eval 'rs.initiate({_id:"quickfile",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

For a local-only runtime, set `MONGO_URI=mongodb://127.0.0.1:27017/quickfile`. `connectDB()` takes the database name from the URI (fallback `quickfile`), which also keeps the test suites isolated in `quickfile_test*`.

## Cutover / rollback

1. Run `npm run atlas:backup`.
2. Normalize (`atlas:normalize:apply`) then provision (`atlas:provision:apply`).
3. Point `MONGO_URI` at Atlas and run `npm run atlas:smoke`.
4. If anything is wrong, restore from the JSON backup (e.g. `mongosh` `db.collection.insertMany(EJSON.parse(...))`) and switch `MONGO_URI` back to the local replica set.
