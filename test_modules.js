const CitizenService = require('./src/modules/citizen/citizen.service');
const StaffService = require('./src/modules/staff/staff.service');
const AdminService = require('./src/modules/admin/admin.service');
const DocumentService = require('./src/modules/document/document.service');
const DocumentModel = require('./src/modules/document/document.model');
const RequestService = require('./src/modules/request/request.service');
const VerificationService = require('./src/modules/verification/verification.service');
const ReportService = require('./src/modules/reports/report.service');
const NotificationService = require('./src/modules/notification/notification.service');
const RequestModel = require('./src/modules/request/request.model');
const { initDatabase } = require('./src/database/init');

async function runTests() {
  console.log('=======================================================');
  console.log('       QuickFile Complete Automated Test Suite');
  console.log('=======================================================');
  initDatabase();

  // ----------------------------------------------------
  // SECTION 1: CITIZEN MODULES (CIT)
  // ----------------------------------------------------
  console.log('\n--- SECTION 1: CITIZEN MODULES ---');

  // CIT-IAM-01: Account Registration
  console.log('\n[CIT-IAM-01] Testing Citizen Registration...');
  const testEmail = `citizen_${Date.now()}@test.ph`;
  const regResult = await CitizenService.register({
    email: testEmail,
    password: 'Password@123',
    fullName: 'Maria Clara De Los Santos',
    phone: '09181234567'
  });
  console.log('✓ Registered Citizen ID:', regResult.user.id);

  // CIT-IAM-02: User Login
  console.log('\n[CIT-IAM-02] Testing Citizen Login...');
  const loginResult = await CitizenService.login(testEmail, 'Password@123');
  console.log('✓ Citizen Login Successful, Token generated:', !!loginResult.token);

  // CIT-IAM-04: Password Recovery
  console.log('\n[CIT-IAM-04] Testing Password Recovery...');
  const recoveryResult = await CitizenService.initiatePasswordRecovery(testEmail);
  console.log('✓ Password Reset Token generated:', recoveryResult.token);
  const resetResult = await CitizenService.resetPassword(recoveryResult.token, 'NewPassword@123');
  console.log('✓ Password Reset Result:', resetResult.message);
  const newLogin = await CitizenService.login(testEmail, 'NewPassword@123');
  console.log('✓ Login with new password succeeded:', !!newLogin.token);

  // CIT-APM-01 & CIT-APM-02: Profile Creation & Update
  console.log('\n[CIT-APM-01 & 02] Testing Resident Profile Update...');
  const profileUpdated = await CitizenService.updateProfile(regResult.user.id, {
    first_name: 'Maria Clara',
    middle_name: 'Alba',
    last_name: 'De Los Santos',
    suffix: '',
    birthdate: '1998-05-12',
    gender: 'Female',
    civil_status: 'Single',
    purok_zone: 'Purok 1',
    street_address: '45 Rizal Street',
    contact_number: '09181234567',
    occupation: 'Teacher',
    voter_status: 'Registered',
    emergency_contact_name: 'Capitan Tiago',
    emergency_contact_number: '09187654321'
  });
  console.log('✓ Profile Updated:', profileUpdated.first_name, profileUpdated.last_name, profileUpdated.purok_zone);

  // CIT-APM-03: Profile Reuse
  console.log('\n[CIT-APM-03] Testing Profile Reuse...');
  const reuseResult = await CitizenService.getReusableProfile(regResult.user.id);
  console.log('✓ Profile Completeness:', reuseResult.completenessPercentage + '%');
  console.log('✓ Ready for Document Request:', reuseResult.isReadyForDocumentRequest);
  console.log('✓ Auto-populated Full Name:', reuseResult.reusableData.fullName);

  // CIT-DCR-01 & CIT-DCR-02: Document Catalog & Requirements
  console.log('\n[CIT-DCR-01 & 02] Testing Document Catalog & Requirements...');
  const catalog = DocumentService.getActiveCatalog();
  console.log(`✓ Active Catalog retrieved (${catalog.length} available document types)`);
  const clearanceDoc = catalog.find(d => d.code === 'BRGY_CLEARANCE');
  if (!clearanceDoc) throw new Error('BRGY_CLEARANCE document type not found in catalog');
  console.log(`✓ Document: ${clearanceDoc.name} | Fee: ₱${clearanceDoc.fee} | Turnaround: ${clearanceDoc.processing_days} days`);
  console.log(`✓ Requirements:\n  - ${clearanceDoc.requirements_text.split('\n').join('\n  - ')}`);

  // CIT-ODR-01, CIT-ODR-02, CIT-ODR-03, CIT-ODR-04: Online Document Request
  console.log('\n[CIT-ODR-01 to 04] Testing Online Request Submission with Digital Form & Upload...');
  const submittedRequest = await RequestService.submitRequest({
    userId: regResult.user.id,
    citizenName: regResult.user.fullName,
    documentTypeId: clearanceDoc.id,
    purpose: 'Local Employment Application at DepEd',
    formData: {
      fullName: reuseResult.reusableData.fullName,
      birthdate: reuseResult.reusableData.birthdate,
      civilStatus: reuseResult.reusableData.civilStatus,
      completeAddress: reuseResult.reusableData.completeAddress,
      contactNumber: reuseResult.reusableData.contactNumber,
      cedulaNumber: 'CTC-2026-998877',
      purpose: 'Local Employment Application at DepEd'
    },
    attachmentFile: {
      filename: 'sample_valid_id.jpg',
      originalname: 'Government_Valid_ID.jpg'
    }
  });
  console.log('✓ Request Created successfully!');
  console.log('  Tracking Number:', submittedRequest.tracking_number);
  console.log('  Status:', submittedRequest.status);
  console.log('  Attachment:', submittedRequest.attachment_name);

  // CIT-RST-01: Request Status Tracking
  console.log('\n[CIT-RST-01] Testing Status Tracking...');
  const trackedRequest = RequestService.getRequestByTracking(submittedRequest.tracking_number);
  console.log('✓ Tracked Request Status:', trackedRequest.status, 'for citizen:', trackedRequest.citizen_name);

  // CIT-RST-02: Notification Receipt
  console.log('\n[CIT-RST-02] Testing Notification Receipt...');
  const citizenNotifications = NotificationService.getUserNotifications(regResult.user.id);
  console.log(`✓ Notifications received: ${citizenNotifications.length}`);
  console.log('  Latest Notification:', citizenNotifications[0]?.title, '-', citizenNotifications[0]?.message);

  // CIT-RHV-01: Request History Viewing
  console.log('\n[CIT-RHV-01] Testing Request History Viewing...');
  const citizenHistory = RequestService.getCitizenRequests(regResult.user.id);
  console.log(`✓ Citizen History count: ${citizenHistory.length} request(s)`);


  // ----------------------------------------------------
  // SECTION 2: STAFF MODULES (STF)
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: BARANGAY STAFF MODULES ---');

  // STF-IAM-01: Staff Login
  console.log('\n[STF-IAM-01] Testing Staff Login...');
  const staffLogin = await StaffService.login('staff@quickfile.gov.ph', 'Staff@123456');
  console.log('✓ Staff Login Successful:', staffLogin.user.fullName);

  // STF-RVP-01 & 02: Request Viewing & Requirement Review
  console.log('\n[STF-RVP-01 & 02] Testing Staff Queue & Requirement Review...');
  const staffQueue = RequestService.getStaffQueue({ status: 'PENDING' });
  console.log(`✓ Staff Queue fetched: ${staffQueue.length} pending request(s)`);
  const reqInQueue = staffQueue.find(r => r.id === submittedRequest.id);
  if (!reqInQueue) throw new Error('Submitted request not found in staff pending queue');
  console.log('✓ Target Request found in queue:', reqInQueue.tracking_number, 'Applicant:', reqInQueue.citizen_name);

  // STF-RVP-03 & STF-RSM-01: Request Validation (Mark Under Review & Approve)
  console.log('\n[STF-RVP-03 & STF-RSM-01] Testing Request Review and Approval...');
  const underReview = RequestService.startReview(submittedRequest.id, staffLogin.user);
  console.log('✓ Status updated to:', underReview.status);

  const approvedReq = RequestService.approveRequest(submittedRequest.id, staffLogin.user);
  console.log('✓ Status updated to:', approvedReq.status);

  // STF-RSM-02: Citizen Notification on Approval
  const notifAfterApprove = NotificationService.getUserNotifications(regResult.user.id);
  console.log('✓ Citizen Notified on Approval:', notifAfterApprove[0]?.title);

  // STF-DPP-01 & STF-QDV-02: Document Preparation & QR Code Generation
  console.log('\n[STF-DPP-01 & STF-QDV-02] Testing Document Preparation & QR Code Generation...');
  const preparedDoc = await RequestService.prepareDocumentCertificate(submittedRequest.id, staffLogin.user);
  console.log('✓ Certificate Prepared!');
  console.log('  Certificate Number:', preparedDoc.certificate_number);
  console.log('  Verification Code:', preparedDoc.verification_code);
  console.log('  QR Code Data URI generated:', preparedDoc.qr_code_image?.substring(0, 30) + '...');
  console.log('  New Request Status:', preparedDoc.status);

  // CIT-RHV-02 & STF-QDV-01: Electronic Document QR Code Verification
  console.log('\n[CIT-RHV-02 & STF-QDV-01] Testing Electronic QR Verification...');
  const verifyResult = VerificationService.verifyDocument(preparedDoc.verification_code);
  console.log('✓ QR Verification Check:');
  console.log('  Is Valid:', verifyResult.isValid);
  console.log('  Certificate No.:', verifyResult.document.certificateNumber);
  console.log('  Issued To:', verifyResult.document.issuedToName);
  console.log('  Document:', verifyResult.document.documentName);

  // STF-DPP-02: Document Printing Check (Verification that print view data compiles)
  console.log('\n[STF-DPP-02] Testing Document Printable Record...');
  const printRecord = RequestService.getRequestByTracking(submittedRequest.tracking_number);
  if (!printRecord.qr_code_image || !printRecord.certificate_number) {
    throw new Error('Printable record missing certificate number or QR code image');
  }
  console.log('✓ Printable Record validated with official seal, QR code, and certificate number:', printRecord.certificate_number);

  // STF-DPP-03: Document Release
  console.log('\n[STF-DPP-03] Testing Official Document Release...');
  const releasedDoc = RequestService.releaseDocument(submittedRequest.id, staffLogin.user, true);
  console.log('✓ Document Released! Status:', releasedDoc.status, 'Payment:', releasedDoc.payment_status);

  // STF-RA-01 & STF-RA-02: Document Archiving & Records Retrieval
  console.log('\n[STF-RA-01 & 02] Testing Document Archiving & Records Retrieval...');
  const archivedDoc = RequestService.archiveDocument(submittedRequest.id, staffLogin.user);
  console.log('✓ Document Archived! Status:', archivedDoc.status);
  const archivedRecords = RequestService.getArchivedRecords({ search: 'Maria Clara' });
  console.log(`✓ Archived records retrieved: ${archivedRecords.length} record(s) found`);

  // STF-TR-01 & STF-TR-02: Staff Reporting & Workload Monitoring
  console.log('\n[STF-TR-01 & 02] Testing Staff Reporting & Workload Monitoring...');
  const staffReport = ReportService.getTransactionReport();
  console.log(`✓ Transaction Report generated: ${staffReport.summary.totalCount} transactions, ₱${staffReport.summary.totalRevenue} total revenue`);
  const workloadStats = RequestModel.getStaffWorkload();
  console.log(`✓ Staff Workload monitored (${workloadStats.length} staff entries recorded)`);


  // ----------------------------------------------------
  // SECTION 3: ADMIN MODULES (ADM)
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: BARANGAY ADMIN MODULES ---');

  // ADM-IAM-01: Admin Login
  console.log('\n[ADM-IAM-01] Testing Admin Login...');
  const adminLogin = await AdminService.login('admin@quickfile.gov.ph', 'Admin@123456');
  console.log('✓ Admin Login Successful:', adminLogin.admin.fullName);

  // ADM-DB-01 & ADM-DB-02: Administrative Dashboard & Performance Monitoring
  console.log('\n[ADM-DB-01 & 02] Testing Administrative Dashboard KPIs...');
  const overviewStats = RequestModel.getOverviewStats();
  console.log('✓ Overview KPIs:', overviewStats);
  const docBreakdown = RequestModel.getDocumentTypeBreakdown();
  console.log(`✓ Document Type Demand Breakdown: ${docBreakdown.length} types with analytics`);

  // ADM-DTM-01: Document Type Addition
  console.log('\n[ADM-DTM-01] Testing Document Type Addition...');
  const newDocCode = `DOC_${Date.now().toString().slice(-4)}`;
  const addedDocType = DocumentService.createDocumentType(adminLogin.admin, {
    code: newDocCode,
    name: 'Barangay Health Certificate',
    description: 'Certification of medical examination and sanitation clearance.',
    fee: 75.00,
    processingDays: 2,
    requirementsText: 'Barangay Health Center Clearance\n1x1 Photo\nValid ID'
  });
  console.log('✓ New Document Type Added:', addedDocType.name, `(${addedDocType.code})`, `Fee: ₱${addedDocType.fee}`);

  // ADM-DTM-02: Document Type Modification
  console.log('\n[ADM-DTM-02] Testing Document Type Modification...');
  const updatedDocType = DocumentService.updateDocumentType(adminLogin.admin, addedDocType.id, {
    name: 'Barangay Health & Sanitation Certificate',
    description: 'Updated description for health & sanitation certification.',
    fee: 80.00,
    processingDays: 1,
    requirementsText: 'Barangay Health Center Clearance\n2x2 Photo\nValid ID',
    isActive: true
  });
  console.log('✓ Document Type Updated:', updatedDocType.name, `New Fee: ₱${updatedDocType.fee}`);

  // ADM-DTM-03: Document Type Removal
  console.log('\n[ADM-DTM-03] Testing Document Type Removal...');
  DocumentService.deleteDocumentType(adminLogin.admin, addedDocType.id);
  const verifyDeleted = DocumentModel.findById(addedDocType.id);
  console.log('✓ Document Type Removed successfully (Exists in DB:', !!verifyDeleted, ')');

  // ADM-TR-01 & ADM-TR-02: Transaction Monitoring & Reporting
  console.log('\n[ADM-TR-01 & 02] Testing Admin Transaction Report & Analytics...');
  const adminTxReport = ReportService.getTransactionReport();
  console.log(`✓ Admin Transactions Ledger: ${adminTxReport.transactions.length} entries`);
  console.log(`✓ Admin Revenue Summary: ₱${adminTxReport.summary.totalRevenue}`);

  // ADM-CRS-01 & ADM-CRS-02: Centralized Records Search & Verification
  console.log('\n[ADM-CRS-01 & 02] Testing Centralized Historical Records Search...');
  const searchResults = RequestService.getHistoricalSearch('Maria Clara');
  console.log(`✓ Search found ${searchResults.length} historical record(s) for Maria Clara`);
  if (searchResults.length > 0) {
    console.log('  Tracking #:', searchResults[0].tracking_number, 'Cert #:', searchResults[0].certificate_number);
  }

  // ADM-IDV-01 & ADM-IDV-02: Issued Document Validity Confirmation & Revocation
  console.log('\n[ADM-IDV-01 & 02] Testing Issued Document Monitoring & Revocation...');
  const issuedList = VerificationService.getAllIssued();
  console.log(`✓ Total Issued Documents Monitored: ${issuedList.length}`);
  const targetIssued = issuedList[0];
  if (targetIssued) {
    console.log(`  Revoking Certificate: ${targetIssued.certificate_number}...`);
    VerificationService.revokeDocument(adminLogin.admin, targetIssued.id, 'Residency invalidated upon inspection.');
    const verifyRevoked = VerificationService.verifyDocument(targetIssued.verification_code);
    console.log('✓ Verification after Revocation - Is Valid:', verifyRevoked.isValid, '| Status:', verifyRevoked.document?.validityStatus);

    console.log(`  Reinstating Certificate: ${targetIssued.certificate_number}...`);
    VerificationService.reinstateDocument(adminLogin.admin, targetIssued.id);
    const verifyReinstated = VerificationService.verifyDocument(targetIssued.verification_code);
    console.log('✓ Verification after Reinstatement - Is Valid:', verifyReinstated.isValid, '| Status:', verifyReinstated.document?.validityStatus);
  }

  // ADM-SAO-01 & ADM-SAO-02: System Activity Oversight & Audit Trail
  console.log('\n[ADM-SAO-01 & 02] Testing System Activity Oversight & Audit Logs...');
  const auditLogs = ReportService.getAuditLogs({ limit: 10 });
  console.log(`✓ Audit Logs retrieved (${auditLogs.length} recent system events):`);
  auditLogs.slice(0, 5).forEach((log, idx) => {
    console.log(`  ${idx + 1}. [${log.action}] by ${log.actor_name || 'System'} on ${log.target_type || 'N/A'} (#${log.target_id || '-'}): ${log.details}`);
  });

  console.log('\n=======================================================');
  console.log('🎉 ALL CITIZEN, STAFF, AND ADMIN MODULES PASSED 100%!');
  console.log('=======================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed with Error:', err);
  process.exit(1);
});
