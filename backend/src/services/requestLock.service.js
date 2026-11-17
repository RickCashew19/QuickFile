const { DocumentRequest, AuditLog } = require('../models');

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Concurrency Control Service: Pessimistic Document Request Locking
 * Features atomic acquisition, TTL safety, renewal, ownership checks, and audit logging.
 */
class RequestLockService {
  /**
   * Acquires or renews a pessimistic lock on a DocumentRequest.
   * Atomic operation using a single findOneAndUpdate query.
   * Succeeds only if:
   * 1. There is no active lock (lock.locked_by is null or unset)
   * 2. The existing lock is expired (lock.expires_at < now)
   * 3. The current user already holds the active lock (renewal)
   *
   * @param {string|ObjectId} requestId - DocumentRequest ID
   * @param {Object} user - Authenticated user object (_id, full_name, role)
   * @param {Object} [meta={}] - Request metadata (ipAddress, userAgent, durationMs)
   * @returns {Promise<Object>} The acquired lock document
   */
  async acquireLock(requestId, user, meta = {}) {
    const { ipAddress = '', userAgent = '', durationMs = DEFAULT_LOCK_DURATION_MS } = meta;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    const userId = user._id || user.id;
    const userName = user.full_name || user.name || 'Staff Member';

    // 1. Inspect existing lock state for audit logging distinctions (e.g. expired takeover vs new)
    const existing = await DocumentRequest.findById(requestId).select('lock tracking_number');
    if (!existing) {
      const err = new Error('Document request not found.');
      err.statusCode = 404;
      throw err;
    }

    const wasExpiredTakeover = Boolean(
      existing.lock &&
      existing.lock.locked_by &&
      existing.lock.locked_by.toString() !== userId.toString() &&
      existing.lock.expires_at &&
      new Date(existing.lock.expires_at) <= now
    );

    // 2. Atomic findOneAndUpdate query
    const updatedDoc = await DocumentRequest.findOneAndUpdate(
      {
        _id: requestId,
        $or: [
          { 'lock.locked_by': null },
          { 'lock.expires_at': null },
          { 'lock.expires_at': { $lte: now } },
          { 'lock.locked_by': userId },
        ],
      },
      {
        $set: {
          'lock.locked_by': userId,
          'lock.locked_by_name': userName,
          'lock.locked_at': now,
          'lock.expires_at': expiresAt,
        },
      },
      { new: true, runValidators: true }
    );

    // 3. If atomic update failed, another user holds an active lock
    if (!updatedDoc) {
      const current = await DocumentRequest.findById(requestId).select('lock tracking_number');
      const holderName = current?.lock?.locked_by_name || 'another staff member';
      const holderExpiresAt = current?.lock?.expires_at ? new Date(current.lock.expires_at) : null;
      const formattedTime = holderExpiresAt ? holderExpiresAt.toLocaleTimeString() : 'soon';

      await AuditLog.create({
        user_id: userId,
        actor_name: userName,
        action: 'LOCK_DENIED',
        module: 'REQUEST_LOCK',
        target_id: requestId.toString(),
        target_type: 'DocumentRequest',
        details: {
          tracking_number: current?.tracking_number,
          holder_id: current?.lock?.locked_by,
          holder_name: holderName,
          expires_at: holderExpiresAt,
        },
        ip_address: ipAddress,
        user_agent: userAgent,
      }).catch(() => null);

      const err = new Error(
        `Request is currently locked by ${holderName} until ${formattedTime}. Please wait or select another request.`
      );
      err.statusCode = 423; // 423 Locked
      err.code = 'LOCKED';
      err.lock = current?.lock;
      throw err;
    }

    // 4. Log successful acquisition or takeover
    const auditAction = wasExpiredTakeover ? 'LOCK_EXPIRED_TAKEOVER' : 'LOCK_ACQUIRED';
    await AuditLog.create({
      user_id: userId,
      actor_name: userName,
      action: auditAction,
      module: 'REQUEST_LOCK',
      target_id: requestId.toString(),
      target_type: 'DocumentRequest',
      details: {
        tracking_number: updatedDoc.tracking_number,
        locked_at: now,
        expires_at: expiresAt,
        duration_ms: durationMs,
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    }).catch(() => null);

    return updatedDoc.lock;
  }

  /**
   * Renews an existing lock for the current holder.
   *
   * @param {string|ObjectId} requestId
   * @param {Object} user
   * @param {Object} [meta={}]
   * @returns {Promise<Object>}
   */
  async renewLock(requestId, user, meta = {}) {
    const { ipAddress = '', userAgent = '', durationMs = DEFAULT_LOCK_DURATION_MS } = meta;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    const userId = user._id || user.id;

    const updatedDoc = await DocumentRequest.findOneAndUpdate(
      {
        _id: requestId,
        'lock.locked_by': userId,
        'lock.expires_at': { $gt: now },
      },
      {
        $set: {
          'lock.expires_at': expiresAt,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedDoc) {
      // If the lock expired or was taken over, delegate to acquireLock
      return this.acquireLock(requestId, user, meta);
    }

    return updatedDoc.lock;
  }

  /**
   * Releases a lock.
   * Allowed only for the current lock holder, or an administrator.
   *
   * @param {string|ObjectId} requestId
   * @param {Object} user
   * @param {Object} [meta={}]
   * @returns {Promise<boolean>}
   */
  async releaseLock(requestId, user, meta = {}) {
    const { ipAddress = '', userAgent = '' } = meta;
    const userId = user._id || user.id;
    const isAdmin = user.role === 'admin';
    const userName = user.full_name || user.name || 'Staff Member';

    const current = await DocumentRequest.findById(requestId).select('lock tracking_number');
    if (!current) {
      const err = new Error('Document request not found.');
      err.statusCode = 404;
      throw err;
    }

    if (!current.lock || !current.lock.locked_by) {
      return true; // Already unlocked
    }

    const isHolder = current.lock.locked_by.toString() === userId.toString();

    if (!isHolder && !isAdmin) {
      const err = new Error(
        `Forbidden: You cannot release a lock held by ${current.lock.locked_by_name || 'another user'}.`
      );
      err.statusCode = 403;
      throw err;
    }

    const wasForceReleased = !isHolder && isAdmin;

    await DocumentRequest.updateOne(
      { _id: requestId },
      {
        $set: {
          'lock.locked_by': null,
          'lock.locked_by_name': null,
          'lock.locked_at': null,
          'lock.expires_at': null,
        },
      }
    );

    const auditAction = wasForceReleased ? 'LOCK_FORCE_RELEASED' : 'LOCK_RELEASED';
    await AuditLog.create({
      user_id: userId,
      actor_name: userName,
      action: auditAction,
      module: 'REQUEST_LOCK',
      target_id: requestId.toString(),
      target_type: 'DocumentRequest',
      details: {
        tracking_number: current.tracking_number,
        released_holder_id: current.lock.locked_by,
        released_holder_name: current.lock.locked_by_name,
        was_forced: wasForceReleased,
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    }).catch(() => null);

    return true;
  }

  /**
   * Asserts that a request is not locked by another user.
   * Throws HTTP 423 if held by someone else and not expired.
   *
   * @param {string|ObjectId} requestId
   * @param {Object} user
   * @param {Object} [meta={}]
   */
  async assertLockHeld(requestId, user, meta = {}) {
    const { ipAddress = '', userAgent = '', session = null } = meta;
    const current = await DocumentRequest.findById(requestId).select('lock tracking_number').session(session || null);
    if (!current) {
      const err = new Error('Document request not found.');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    const userId = user._id || user.id;

    if (
      current.lock &&
      current.lock.locked_by &&
      current.lock.locked_by.toString() !== userId.toString() &&
      current.lock.expires_at &&
      new Date(current.lock.expires_at) > now
    ) {
      const holderName = current.lock.locked_by_name || 'another staff member';
      const holderExpiresAt = new Date(current.lock.expires_at);
      const formattedTime = holderExpiresAt.toLocaleTimeString();

      await AuditLog.create([{
        user_id: userId,
        actor_name: user.full_name || 'Staff Member',
        action: 'LOCK_DENIED',
        module: 'REQUEST_LOCK',
        target_id: requestId.toString(),
        target_type: 'DocumentRequest',
        details: {
          tracking_number: current.tracking_number,
          holder_id: current.lock.locked_by,
          holder_name: holderName,
          expires_at: holderExpiresAt,
        },
        ip_address: ipAddress,
        user_agent: userAgent,
      }], { session }).catch(() => null);

      const err = new Error(
        `Action blocked: Request is locked by ${holderName} until ${formattedTime}.`
      );
      err.statusCode = 423;
      err.code = 'LOCKED';
      err.lock = current.lock;
      throw err;
    }

    return true;
  }

  /**
   * Retrieves current lock status for a request.
   *
   * @param {string|ObjectId} requestId
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  async getLockStatus(requestId, user) {
    const current = await DocumentRequest.findById(requestId).select('lock');
    if (!current) {
      const err = new Error('Document request not found.');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    const isLocked = Boolean(
      current.lock &&
      current.lock.locked_by &&
      current.lock.expires_at &&
      new Date(current.lock.expires_at) > now
    );

    const userId = user ? (user._id || user.id).toString() : null;
    const isHeldByMe = Boolean(
      isLocked &&
      current.lock.locked_by.toString() === userId
    );

    return {
      is_locked: isLocked,
      is_held_by_current_user: isHeldByMe,
      lock: isLocked ? current.lock : null,
    };
  }
}

module.exports = new RequestLockService();
