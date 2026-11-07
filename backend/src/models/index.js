const User = require('./User');
const CitizenProfile = require('./CitizenProfile');
const StaffDetail = require('./StaffDetail');
const StaffPermission = require('./StaffPermission');
const PasswordReset = require('./PasswordReset');
const DocumentType = require('./DocumentType');
const DocumentRequest = require('./DocumentRequest');
const IssuedDocument = require('./IssuedDocument');
const Notification = require('./Notification');
const AuditLog = require('./AuditLog');
const AppSetting = require('./AppSetting');
const SuperAdminLockout = require('./SuperAdminLockout');

module.exports = {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  PasswordReset,
  DocumentType,
  DocumentRequest,
  IssuedDocument,
  Notification,
  AuditLog,
  AppSetting,
  SuperAdminLockout,
};
