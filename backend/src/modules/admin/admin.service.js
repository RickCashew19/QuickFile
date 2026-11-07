const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  DocumentRequest,
  IssuedDocument,
  Notification,
  PasswordReset,
  AuditLog,
  DocumentType,
} = require('../../models');
const {
  ROLES,
  REQUEST_STATUSES,
  VALIDITY_STATUSES,
  PAYMENT_STATUSES,
  STAFF_PERMISSIONS,
  NOTIFICATION_CHANNELS,
} = require('../../config/constants');
const { getDateRanges, escapeRegex } = require('../../utils/dateUtil');
const staffService = require('../staff/staff.service');

const ATTACHMENTS_DIR = path.join(__dirname, '../../../uploads/attachments');

/**
 * Safely removes a file from the attachments directory
 */
function safeDeleteFile(filename) {
  if (!filename) return;
  try {
    const fullPath = path.join(ATTACHMENTS_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error(`[Admin Service] Failed to delete file ${filename}:`, err.message);
  }
}

/**
 * Sanitizes a user object to never return password_hash
 */
function sanitizeUser(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password_hash;
  delete obj.__v;
  return obj;
}

// ==============================================================================
// 1. Dashboard & Live Stats
// ==============================================================================

async function getDashboard() {
  const { todayStart, todayEnd, monthStart, monthEnd } = getDateRanges();

  // 1. Request counts across all 9 statuses
  const statusCountsRaw = await DocumentRequest.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const statusCounts = {};
  for (const status of Object.values(REQUEST_STATUSES)) {
    statusCounts[status] = 0;
  }
  for (const item of statusCountsRaw) {
    if (item._id && statusCounts[item._id] !== undefined) {
      statusCounts[item._id] = item.count;
    }
  }

  // 2. Revenue today and revenue this month (paid requests only)
  const revenueTodayAgg = await DocumentRequest.aggregate([
    {
      $match: {
        payment_status: PAYMENT_STATUSES.PAID,
        paid_at: { $gte: todayStart, $lte: todayEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$fee' } } },
  ]);
  const revenue_today = revenueTodayAgg.length > 0 ? revenueTodayAgg[0].total : 0;

  const revenueMonthAgg = await DocumentRequest.aggregate([
    {
      $match: {
        payment_status: PAYMENT_STATUSES.PAID,
        paid_at: { $gte: monthStart, $lte: monthEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$fee' } } },
  ]);
  const revenue_this_month = revenueMonthAgg.length > 0 ? revenueMonthAgg[0].total : 0;

  // 3. Active users
  const active_citizens_count = await User.countDocuments({ role: ROLES.CITIZEN, is_active: true });
  const active_staff_count = await User.countDocuments({ role: ROLES.STAFF, is_active: true });

  // 4. Top document types by demand
  const demandRaw = await DocumentRequest.aggregate([
    {
      $group: {
        _id: '$document_type_id',
        count: { $sum: 1 },
        collected_revenue: {
          $sum: {
            $cond: [{ $eq: ['$payment_status', PAYMENT_STATUSES.PAID] }, '$fee', 0],
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const docTypeIds = demandRaw.map((d) => d._id).filter(Boolean);
  const docTypes = await DocumentType.find({ _id: { $in: docTypeIds } }).lean();
  const docTypeMap = new Map(docTypes.map((t) => [t._id.toString(), t]));

  const demand_by_type = demandRaw.map((item) => {
    const doc = docTypeMap.get(item._id ? item._id.toString() : '');
    return {
      document_type_id: item._id,
      name: doc ? doc.name : 'Unknown Document',
      code: doc ? doc.code : 'UNKNOWN',
      count: item.count,
      collected_revenue: item.collected_revenue,
    };
  });

  // 5. 10 most recent requests
  const recentRequests = await DocumentRequest.find({})
    .sort({ created_at: -1 })
    .limit(10)
    .populate('citizen_id', 'full_name email')
    .populate('document_type_id', 'name code')
    .lean();

  const recent_requests = recentRequests.map((r) => ({
    id: r._id,
    tracking_number: r.tracking_number,
    citizen_name: r.citizen_id ? r.citizen_id.full_name : 'Unknown Citizen',
    document_type_name: r.document_type_id ? r.document_type_id.name : 'Unknown Document',
    document_type_code: r.document_type_id ? r.document_type_id.code : 'UNKNOWN',
    status: r.status,
    fee: r.fee,
    created_at: r.created_at,
  }));

  return {
    status_counts: statusCounts,
    revenue_today,
    revenue_this_month,
    active_citizens_count,
    active_staff_count,
    demand_by_type,
    recent_requests,
  };
}

async function getLiveStats() {
  const { todayStart } = getDateRanges();

  const liveStatuses = [
    REQUEST_STATUSES.PENDING,
    REQUEST_STATUSES.UNDER_REVIEW,
    REQUEST_STATUSES.APPROVED,
    REQUEST_STATUSES.IN_PREPARATION,
    REQUEST_STATUSES.READY_FOR_PICKUP,
  ];

  const countsRaw = await DocumentRequest.aggregate([
    { $match: { status: { $in: liveStatuses } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const queueCounts = {};
  for (const s of liveStatuses) {
    queueCounts[s] = 0;
  }
  for (const c of countsRaw) {
    queueCounts[c._id] = c.count;
  }

  const todayRequestsCount = await DocumentRequest.countDocuments({
    created_at: { $gte: todayStart },
  });

  const todayRevenueAgg = await DocumentRequest.aggregate([
    {
      $match: {
        payment_status: PAYMENT_STATUSES.PAID,
        paid_at: { $gte: todayStart },
      },
    },
    { $group: { _id: null, total: { $sum: '$fee' } } },
  ]);
  const today_revenue = todayRevenueAgg.length > 0 ? todayRevenueAgg[0].total : 0;

  return {
    queue: queueCounts,
    today_requests_count: todayRequestsCount,
    today_revenue,
    timestamp: new Date().toISOString(),
  };
}

// ==============================================================================
// 2. Staff Management
// ==============================================================================

async function listStaff({ search, is_active, page = 1, limit = 10 }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const userQuery = { role: ROLES.STAFF };

  if (is_active !== undefined) {
    userQuery.is_active = is_active === 'true' || is_active === true;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeRegex(search.trim());
    // Also search by employee_id from StaffDetail
    const matchingDetails = await StaffDetail.find({
      employee_id: { $regex: escaped, $options: 'i' },
    }).select('user_id');
    const detailUserIds = matchingDetails.map((d) => d.user_id);

    userQuery.$or = [
      { full_name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
      { _id: { $in: detailUserIds } },
    ];
  }

  const total = await User.countDocuments(userQuery);
  const users = await User.find(userQuery)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const userIds = users.map((u) => u._id);
  const details = await StaffDetail.find({ user_id: { $in: userIds } }).lean();
  const permissions = await StaffPermission.find({ user_id: { $in: userIds } }).lean();

  const detailMap = new Map(details.map((d) => [d.user_id.toString(), d]));
  const permMap = new Map(permissions.map((p) => [p.user_id.toString(), p]));

  const staff = users.map((u) => {
    const sanitized = sanitizeUser(u);
    sanitized.detail = detailMap.get(u._id.toString()) || null;
    sanitized.permissions = permMap.get(u._id.toString()) || null;
    return sanitized;
  });

  return {
    staff,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

async function getStaffById(id) {
  const user = await User.findOne({ _id: id, role: ROLES.STAFF }).lean();
  if (!user) {
    const err = new Error('Staff member not found.');
    err.statusCode = 404;
    throw err;
  }
  const detail = await StaffDetail.findOne({ user_id: id }).lean();
  const permissions = await StaffPermission.findOne({ user_id: id }).lean();
  const sanitized = sanitizeUser(user);
  sanitized.detail = detail || null;
  sanitized.permissions = permissions || null;
  return sanitized;
}

async function createStaff(data, actorUser) {
  const { email, password, full_name, phone, employee_id, position, department, permissions } = data;

  // 1. Input validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Validation error: A valid email address is required.');
    err.statusCode = 400;
    throw err;
  }

  if (!full_name || full_name.trim().length < 2 || full_name.trim().length > 100) {
    const err = new Error('Validation error: Full name must be between 2 and 100 characters.');
    err.statusCode = 400;
    throw err;
  }

  if (phone && !/^(09|\+639)\d{9}$/.test(phone.trim())) {
    const err = new Error('Validation error: Invalid Philippine phone number format.');
    err.statusCode = 400;
    throw err;
  }

  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,72}$/;
  if (!password || !passwordRegex.test(password)) {
    const err = new Error('Validation error: Password must be between 8 and 72 characters and contain both letters and numbers.');
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    const err = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  if (employee_id && employee_id.trim()) {
    const existingEmployee = await StaffDetail.findOne({ employee_id: employee_id.trim() });
    if (existingEmployee) {
      const err = new Error(`Employee ID "${employee_id.trim()}" is already assigned to another staff member.`);
      err.statusCode = 409;
      throw err;
    }
  }

  if (permissions) {
    for (const key of Object.keys(permissions)) {
      if (!STAFF_PERMISSIONS.includes(key)) {
        const err = new Error(`Invalid permission key: "${key}".`);
        err.statusCode = 400;
        throw err;
      }
      if (typeof permissions[key] !== 'boolean') {
        const err = new Error(`Permission value for "${key}" must be a boolean.`);
        err.statusCode = 400;
        throw err;
      }
    }
  }

  // 2. Ordered creation with rollback safety
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    email: email.toLowerCase().trim(),
    password_hash: passwordHash,
    full_name: full_name.trim(),
    phone: phone ? phone.trim() : '',
    role: ROLES.STAFF,
    is_active: true,
  });

  let detail;
  let permRecord;
  try {
    detail = await StaffDetail.create({
      user_id: user._id,
      employee_id: employee_id ? employee_id.trim() : '',
      position: position ? position.trim() : 'Barangay Staff',
      department: department ? department.trim() : 'General Services',
      contact_number: phone ? phone.trim() : '',
    });

    const permObj = { user_id: user._id };
    for (const p of STAFF_PERMISSIONS) {
      permObj[p] = permissions ? Boolean(permissions[p]) : false;
    }
    permRecord = await StaffPermission.create(permObj);
  } catch (err) {
    // Cascade rollback
    await StaffPermission.deleteOne({ user_id: user._id });
    await StaffDetail.deleteOne({ user_id: user._id });
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  // 3. Audit log
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'STAFF_CREATE',
    module: 'STAFF',
    target_id: user._id,
    target_type: 'User',
    details: {
      email: user.email,
      full_name: user.full_name,
      employee_id: detail.employee_id,
      position: detail.position,
    },
  });

  const sanitized = sanitizeUser(user);
  sanitized.detail = detail;
  sanitized.permissions = permRecord;
  return sanitized;
}

async function updateStaff(id, data, actorUser) {
  const user = await User.findOne({ _id: id, role: ROLES.STAFF });
  if (!user) {
    const err = new Error('Staff member not found.');
    err.statusCode = 404;
    throw err;
  }

  const { full_name, phone, employee_id, position, department } = data;

  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || full_name.trim().length < 2 || full_name.trim().length > 100) {
      const err = new Error('Validation error: Full name must be between 2 and 100 characters.');
      err.statusCode = 400;
      throw err;
    }
    user.full_name = full_name.trim();
  }

  if (phone !== undefined) {
    if (phone && !/^(09|\+639)\d{9}$/.test(phone.trim())) {
      const err = new Error('Validation error: Invalid Philippine phone number format.');
      err.statusCode = 400;
      throw err;
    }
    user.phone = phone ? phone.trim() : '';
  }

  await user.save();

  let detail = await StaffDetail.findOne({ user_id: id });
  if (!detail) {
    detail = new StaffDetail({ user_id: id });
  }

  if (employee_id !== undefined && employee_id.trim() !== detail.employee_id) {
    if (employee_id.trim()) {
      const existing = await StaffDetail.findOne({
        employee_id: employee_id.trim(),
        user_id: { $ne: id },
      });
      if (existing) {
        const err = new Error(`Employee ID "${employee_id.trim()}" is already assigned to another staff member.`);
        err.statusCode = 409;
        throw err;
      }
    }
    detail.employee_id = employee_id.trim();
  }

  if (position !== undefined) detail.position = position.trim();
  if (department !== undefined) detail.department = department.trim();
  if (phone !== undefined) detail.contact_number = phone ? phone.trim() : '';
  await detail.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'STAFF_UPDATE',
    module: 'STAFF',
    target_id: user._id,
    target_type: 'User',
    details: { modified_fields: Object.keys(data) },
  });

  const permissions = await StaffPermission.findOne({ user_id: id }).lean();
  const sanitized = sanitizeUser(user);
  sanitized.detail = detail;
  sanitized.permissions = permissions;
  return sanitized;
}

async function updateStaffStatus(id, { is_active }, actorUser) {
  if (typeof is_active !== 'boolean') {
    const err = new Error('Validation error: "is_active" must be a boolean.');
    err.statusCode = 400;
    throw err;
  }

  if (actorUser._id.toString() === id.toString()) {
    const err = new Error('Cannot deactivate your own account.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(id);
  if (!user) {
    const err = new Error('User account not found.');
    err.statusCode = 404;
    throw err;
  }

  if (user.role === ROLES.ADMIN && !is_active) {
    const adminCount = await User.countDocuments({ role: ROLES.ADMIN, is_active: true });
    if (adminCount <= 1) {
      const err = new Error('Cannot deactivate the last active administrator.');
      err.statusCode = 400;
      throw err;
    }
  }

  user.is_active = is_active;
  await user.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'STAFF_STATUS_UPDATE',
    module: 'STAFF',
    target_id: user._id,
    target_type: 'User',
    details: { is_active },
  });

  return sanitizeUser(user);
}

async function updateStaffPermissions(id, permissions, actorUser) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    const err = new Error('Validation error: Permissions must be an object.');
    err.statusCode = 400;
    throw err;
  }

  const keys = Object.keys(permissions);
  for (const key of keys) {
    if (!STAFF_PERMISSIONS.includes(key)) {
      const err = new Error(`Invalid permission key: "${key}". Allowed keys: ${STAFF_PERMISSIONS.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }
    if (typeof permissions[key] !== 'boolean') {
      const err = new Error(`Permission value for "${key}" must be a boolean.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const user = await User.findOne({ _id: id, role: ROLES.STAFF });
  if (!user) {
    const err = new Error('Staff member not found.');
    err.statusCode = 404;
    throw err;
  }

  const updatedPerms = await StaffPermission.findOneAndUpdate(
    { user_id: id },
    { $set: permissions },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'STAFF_PERMISSIONS_UPDATE',
    module: 'STAFF',
    target_id: user._id,
    target_type: 'StaffPermission',
    details: { updated_permissions: permissions },
  });

  return updatedPerms;
}

async function resetStaffPassword(id, newPassword, actorUser) {
  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,72}$/;
  if (!newPassword || !passwordRegex.test(newPassword)) {
    const err = new Error('Validation error: New password must be between 8 and 72 characters and contain both letters and numbers.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(id);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  user.password_hash = await User.hashPassword(newPassword);
  user.password_changed_at = new Date();
  await user.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'STAFF_PASSWORD_RESET',
    module: 'STAFF',
    target_id: user._id,
    target_type: 'User',
    details: { email: user.email },
  });

  return { email: user.email };
}

async function deleteStaff(id, actorUser) {
  if (actorUser._id.toString() === id.toString()) {
    const err = new Error('Cannot delete your own account.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(id);
  if (!user) {
    const err = new Error('User account not found.');
    err.statusCode = 404;
    throw err;
  }

  if (user.role === ROLES.ADMIN) {
    const adminCount = await User.countDocuments({ role: ROLES.ADMIN });
    if (adminCount <= 1) {
      const err = new Error('Cannot delete the last administrator account.');
      err.statusCode = 400;
      throw err;
    }
  }

  // Deletion safeguard: Check if referenced in requests or issued certificates
  const requestRefs = await DocumentRequest.countDocuments({
    $or: [
      { reviewed_by: id },
      { prepared_by: id },
      { released_by: id },
      { payment_recorded_by: id },
      { created_by_staff_id: id },
    ],
  });

  const docRefs = await IssuedDocument.countDocuments({
    $or: [{ issued_by: id }, { revoked_by: id }],
  });

  const totalRefs = requestRefs + docRefs;
  if (totalRefs > 0) {
    const err = new Error(
      `Cannot delete staff member with existing processing records (${totalRefs} records found). Deactivate the account instead.`
    );
    err.statusCode = 409;
    throw err;
  }

  await StaffPermission.deleteOne({ user_id: id });
  await StaffDetail.deleteOne({ user_id: id });
  await User.deleteOne({ _id: id });

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'STAFF_DELETE',
    module: 'STAFF',
    target_id: id,
    target_type: 'User',
    details: { email: user.email, full_name: user.full_name },
  });

  return true;
}

// ==============================================================================
// 3. Citizen Management
// ==============================================================================

async function listCitizens({ search, is_active, verification_status, page = 1, limit = 10 }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const userQuery = { role: ROLES.CITIZEN };
  if (is_active !== undefined) {
    userQuery.is_active = is_active === 'true' || is_active === true;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeRegex(search.trim());
    userQuery.$or = [
      { full_name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (verification_status && typeof verification_status === 'string') {
    const matchingProfiles = await CitizenProfile.find({
      verification_status: verification_status.toLowerCase(),
    }).select('user_id');
    userQuery._id = { $in: matchingProfiles.map((p) => p.user_id) };
  }

  const total = await User.countDocuments(userQuery);
  const users = await User.find(userQuery)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const userIds = users.map((u) => u._id);
  const profiles = await CitizenProfile.find({ user_id: { $in: userIds } }).lean();
  const profileMap = new Map(profiles.map((p) => [p.user_id.toString(), p]));

  // Count requests for each citizen
  const reqCounts = await DocumentRequest.aggregate([
    { $match: { citizen_id: { $in: userIds } } },
    { $group: { _id: '$citizen_id', count: { $sum: 1 } } },
  ]);
  const reqCountMap = new Map(reqCounts.map((r) => [r._id.toString(), r.count]));

  const citizens = users.map((u) => {
    const sanitized = sanitizeUser(u);
    sanitized.profile = profileMap.get(u._id.toString()) || null;
    sanitized.request_count = reqCountMap.get(u._id.toString()) || 0;
    return sanitized;
  });

  return {
    citizens,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

async function updateCitizenStatus(id, { is_active }, actorUser) {
  if (typeof is_active !== 'boolean') {
    const err = new Error('Validation error: "is_active" must be a boolean.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ _id: id, role: ROLES.CITIZEN });
  if (!user) {
    const err = new Error('Citizen account not found.');
    err.statusCode = 404;
    throw err;
  }

  user.is_active = is_active;
  await user.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'CITIZEN_STATUS_UPDATE',
    module: 'CITIZEN',
    target_id: user._id,
    target_type: 'User',
    details: { is_active },
  });

  return sanitizeUser(user);
}

async function deleteCitizen(id, actorUser) {
  const user = await User.findOne({ _id: id, role: ROLES.CITIZEN });
  if (!user) {
    const err = new Error('Citizen account not found.');
    err.statusCode = 404;
    throw err;
  }

  // 1. Audit log FIRST with citizen name & email snapshot
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'CITIZEN_DELETE',
    module: 'CITIZEN',
    target_id: id,
    target_type: 'User',
    details: {
      citizen_id: id,
      citizen_name: user.full_name,
      citizen_email: user.email,
    },
  });

  // 2. Cascade cleanup of attachment files on disk
  const requests = await DocumentRequest.find({ citizen_id: id });
  for (const reqDoc of requests) {
    if (Array.isArray(reqDoc.attachments)) {
      for (const att of reqDoc.attachments) {
        if (att.stored_filename) {
          safeDeleteFile(att.stored_filename);
        }
      }
    }
  }

  // 3. Delete dependent records (retain IssuedDocument for permanent registry records)
  await DocumentRequest.deleteMany({ citizen_id: id });
  await Notification.deleteMany({ user_id: id });
  await PasswordReset.deleteMany({ user_id: id });
  await CitizenProfile.deleteOne({ user_id: id });
  await User.deleteOne({ _id: id });

  return true;
}

// ==============================================================================
// 4. Request and Records Management
// ==============================================================================

async function deleteRequest(id, actorUser) {
  const request = await DocumentRequest.findById(id);
  if (!request) {
    const err = new Error('Document request not found.');
    err.statusCode = 404;
    throw err;
  }

  // Delete attachment files from disk
  if (Array.isArray(request.attachments)) {
    for (const att of request.attachments) {
      if (att.stored_filename) {
        safeDeleteFile(att.stored_filename);
      }
    }
  }

  await DocumentRequest.deleteOne({ _id: id });

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'REQUEST_DELETE',
    module: 'REQUEST',
    target_id: id,
    target_type: 'DocumentRequest',
    details: { tracking_number: request.tracking_number },
  });

  return true;
}

// ==============================================================================
// 5. Issued Documents Management
// ==============================================================================

async function listIssuedDocuments({ search, status, page = 1, limit = 10 }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeRegex(search.trim());
    query.$or = [
      { certificate_number: { $regex: escaped, $options: 'i' } },
      { issued_to_name: { $regex: escaped, $options: 'i' } },
      { document_name: { $regex: escaped, $options: 'i' } },
    ];
  }

  const now = new Date();
  if (status && typeof status === 'string') {
    const s = status.toLowerCase().trim();
    if (s === 'expired') {
      query.$or = [
        { validity_status: VALIDITY_STATUSES.EXPIRED },
        { validity_status: VALIDITY_STATUSES.VALID, expires_at: { $ne: null, $lt: now } },
      ];
    } else if (s === 'valid') {
      query.validity_status = VALIDITY_STATUSES.VALID;
      query.$and = [
        {
          $or: [{ expires_at: null }, { expires_at: { $gt: now } }],
        },
      ];
    } else if (s === 'revoked') {
      query.validity_status = VALIDITY_STATUSES.REVOKED;
    }
  }

  const total = await IssuedDocument.countDocuments(query);
  const docs = await IssuedDocument.find(query)
    .sort({ issued_at: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('issued_by', 'full_name email')
    .populate('revoked_by', 'full_name email')
    .lean();

  // Annotate effective dynamic status
  const documents = docs.map((d) => {
    let effectiveStatus = d.validity_status;
    if (d.validity_status === VALIDITY_STATUSES.VALID && d.expires_at && new Date(d.expires_at) < now) {
      effectiveStatus = VALIDITY_STATUSES.EXPIRED;
    }
    return {
      ...d,
      effective_status: effectiveStatus,
    };
  });

  return {
    documents,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

async function revokeIssuedDocument(id, reason, actorUser) {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 200) {
    const err = new Error('Validation error: Revocation reason must be between 5 and 200 characters.');
    err.statusCode = 400;
    throw err;
  }

  const doc = await IssuedDocument.findById(id);
  if (!doc) {
    const err = new Error('Issued document not found.');
    err.statusCode = 404;
    throw err;
  }

  if (doc.validity_status === VALIDITY_STATUSES.REVOKED) {
    const err = new Error('Document is already revoked.');
    err.statusCode = 400;
    throw err;
  }

  if (doc.expires_at && new Date(doc.expires_at) < new Date()) {
    const err = new Error('Cannot revoke an expired document.');
    err.statusCode = 400;
    throw err;
  }

  const updated = await IssuedDocument.findOneAndUpdate(
    { _id: id, validity_status: VALIDITY_STATUSES.VALID },
    {
      $set: {
        validity_status: VALIDITY_STATUSES.REVOKED,
        revoked_by: actorUser._id,
        revoked_at: new Date(),
        revoked_reason: reason.trim(),
      },
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    const err = new Error('Document status changed or was already modified.');
    err.statusCode = 409;
    throw err;
  }

  // Notify citizen in-app
  const parentRequest = await DocumentRequest.findById(doc.request_id);
  if (parentRequest && parentRequest.citizen_id) {
    await Notification.create({
      user_id: parentRequest.citizen_id,
      title: 'Issued Certificate Revoked',
      message: `Your certificate (${doc.certificate_number}) has been revoked by the barangay administration. Reason: ${reason.trim()}`,
      channel: NOTIFICATION_CHANNELS.SYSTEM,
      link: `/citizen/requests/${parentRequest.tracking_number}`,
    });
  }

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_REVOKE',
    module: 'DOCUMENT',
    target_id: id,
    target_type: 'IssuedDocument',
    details: {
      certificate_number: doc.certificate_number,
      reason: reason.trim(),
    },
  });

  return updated;
}

async function reinstateIssuedDocument(id, actorUser) {
  const doc = await IssuedDocument.findById(id);
  if (!doc) {
    const err = new Error('Issued document not found.');
    err.statusCode = 404;
    throw err;
  }

  if (doc.validity_status !== VALIDITY_STATUSES.REVOKED) {
    const err = new Error('Only revoked documents can be reinstated.');
    err.statusCode = 400;
    throw err;
  }

  if (doc.expires_at && new Date(doc.expires_at) < new Date()) {
    const err = new Error('Cannot reinstate an expired document.');
    err.statusCode = 400;
    throw err;
  }

  const updated = await IssuedDocument.findOneAndUpdate(
    { _id: id, validity_status: VALIDITY_STATUSES.REVOKED },
    {
      $set: { validity_status: VALIDITY_STATUSES.VALID },
      $unset: { revoked_by: 1, revoked_at: 1, revoked_reason: 1 },
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    const err = new Error('Document status changed or was already modified.');
    err.statusCode = 409;
    throw err;
  }

  const parentRequest = await DocumentRequest.findById(doc.request_id);
  if (parentRequest && parentRequest.citizen_id) {
    await Notification.create({
      user_id: parentRequest.citizen_id,
      title: 'Issued Certificate Reinstated',
      message: `Your certificate (${doc.certificate_number}) has been reinstated and is now valid.`,
      channel: NOTIFICATION_CHANNELS.SYSTEM,
      link: `/citizen/requests/${parentRequest.tracking_number}`,
    });
  }

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_REINSTATE',
    module: 'DOCUMENT',
    target_id: id,
    target_type: 'IssuedDocument',
    details: { certificate_number: doc.certificate_number },
  });

  return updated;
}

async function deleteIssuedDocument(id, actorUser) {
  const doc = await IssuedDocument.findById(id);
  if (!doc) {
    const err = new Error('Issued document not found.');
    err.statusCode = 404;
    throw err;
  }

  await IssuedDocument.deleteOne({ _id: id });

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_DELETE',
    module: 'DOCUMENT',
    target_id: id,
    target_type: 'IssuedDocument',
    details: { certificate_number: doc.certificate_number },
  });

  return true;
}

// ==============================================================================
// 6. Audit Logs (Read-only)
// ==============================================================================

async function listAuditLogs({ action, module, user_id, actor_name, from, to, page = 1, limit = 20 }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  if (action && typeof action === 'string' && action.trim()) {
    query.action = action.trim().toUpperCase();
  }

  if (module && typeof module === 'string' && module.trim()) {
    query.module = module.trim().toUpperCase();
  }

  if (user_id && typeof user_id === 'string' && mongoose.Types.ObjectId.isValid(user_id)) {
    query.user_id = user_id;
  }

  if (actor_name && typeof actor_name === 'string' && actor_name.trim()) {
    query.actor_name = { $regex: escapeRegex(actor_name.trim()), $options: 'i' };
  }

  if (from || to) {
    query.created_at = {};
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        const err = new Error('Validation error: "from" must be a valid ISO date.');
        err.statusCode = 400;
        throw err;
      }
      query.created_at.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        const err = new Error('Validation error: "to" must be a valid ISO date.');
        err.statusCode = 400;
        throw err;
      }
      toDate.setHours(23, 59, 59, 999);
      query.created_at.$lte = toDate;
    }
    if (from && to && new Date(from) > new Date(to)) {
      const err = new Error('Validation error: "from" date cannot be after "to" date.');
      err.statusCode = 400;
      throw err;
    }
  }

  const total = await AuditLog.countDocuments(query);
  const logs = await AuditLog.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  return {
    logs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

module.exports = {
  getDashboard,
  getLiveStats,
  listStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffStatus,
  updateStaffPermissions,
  resetStaffPassword,
  deleteStaff,
  listCitizens,
  updateCitizenStatus,
  deleteCitizen,
  deleteRequest,
  listIssuedDocuments,
  revokeIssuedDocument,
  reinstateIssuedDocument,
  deleteIssuedDocument,
  listAuditLogs,
};
