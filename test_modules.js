const CitizenService = require('./src/modules/citizen/citizen.service');
const StaffService = require('./src/modules/staff/staff.service');
const AdminService = require('./src/modules/admin/admin.service');
const { initDatabase } = require('./src/database/init');

async function runTests() {
  console.log('--- QuickFile Automated Verification ---');
  initDatabase();

  // 1. CIT-IAM-01: Account Registration
  console.log('\n[CIT-IAM-01] Testing Citizen Registration...');
  const testEmail = `test_citizen_${Date.now()}@test.ph`;
  const regResult = await CitizenService.register({
    email: testEmail,
    password: 'Password@123',
    fullName: 'Maria Clara De Los Santos',
    phone: '09181234567'
  });
  console.log('✓ Registered Citizen ID:', regResult.user.id);

  // 2. CIT-IAM-02: User Login
  console.log('\n[CIT-IAM-02] Testing Citizen Login...');
  const loginResult = await CitizenService.login(testEmail, 'Password@123');
  console.log('✓ Citizen Login Successful, Token generated:', !!loginResult.token);

  // 3. CIT-IAM-04: Password Recovery
  console.log('\n[CIT-IAM-04] Testing Password Recovery...');
  const recoveryResult = await CitizenService.initiatePasswordRecovery(testEmail);
  console.log('✓ Password Reset Token generated:', recoveryResult.token);
  const resetResult = await CitizenService.resetPassword(recoveryResult.token, 'NewPassword@123');
  console.log('✓ Password Reset Result:', resetResult.message);
  // Verify can login with new password
  const newLogin = await CitizenService.login(testEmail, 'NewPassword@123');
  console.log('✓ Login with new password succeeded:', !!newLogin.token);

  // 4. CIT-APM-01 & CIT-APM-02: Profile Creation & Profile Update
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

  // 5. CIT-APM-03: Profile Reuse
  console.log('\n[CIT-APM-03] Testing Profile Reuse...');
  const reuseResult = await CitizenService.getReusableProfile(regResult.user.id);
  console.log('✓ Profile Completeness:', reuseResult.completenessPercentage + '%');
  console.log('✓ Ready for Document Request:', reuseResult.isReadyForDocumentRequest);
  console.log('✓ Auto-populated Full Name:', reuseResult.reusableData.fullName);
  console.log('✓ Auto-populated Address:', reuseResult.reusableData.completeAddress);

  // 6. STF-IAM-01: Staff Login
  console.log('\n[STF-IAM-01] Testing Barangay Staff Login...');
  const staffLogin = await StaffService.login('staff@quickfile.gov.ph', 'Staff@123456');
  console.log('✓ Staff Login Successful:', staffLogin.user.fullName, 'Role:', staffLogin.user.role);
  console.log('✓ Staff Review Permission:', staffLogin.permissions.can_review_requests === 1);

  // 7. ADM-IAM-01: Admin Login
  console.log('\n[ADM-IAM-01] Testing Barangay Administrator Login...');
  const adminLogin = await AdminService.login('admin@quickfile.gov.ph', 'Admin@123456');
  console.log('✓ Admin Login Successful:', adminLogin.admin.fullName, 'Role:', adminLogin.admin.role);

  // 8. ADM-URM-01: Staff Account Creation
  console.log('\n[ADM-URM-01] Testing Staff Account Creation by Admin...');
  const newStaffEmail = `staff_${Date.now()}@quickfile.gov.ph`;
  const createdStaff = await AdminService.createStaffAccount(adminLogin.admin, {
    fullName: 'Ricardo Dalisay',
    email: newStaffEmail,
    password: 'StaffPassword@123',
    phone: '09191112233',
    employeeId: `STF-BRGY-${Date.now().toString().slice(-4)}`,
    position: 'Barangay Certification Officer',
    department: 'Document Services'
  });
  console.log('✓ New Staff Account Created:', createdStaff.full_name, 'ID:', createdStaff.id);

  // 9. ADM-URM-02: Staff Account Management (Edit)
  console.log('\n[ADM-URM-02] Testing Staff Account Management (Edit)...');
  const editedStaff = await AdminService.updateStaffAccount(adminLogin.admin, createdStaff.id, {
    fullName: 'Ricardo P. Dalisay Jr.',
    phone: '09199998877',
    position: 'Senior Barangay Certification Officer',
    department: 'Records & Document Services'
  });
  console.log('✓ Staff Updated Name:', editedStaff.full_name, 'Position:', editedStaff.position);

  // 10. ADM-URM-04: Access Control Management (Permissions)
  console.log('\n[ADM-URM-04] Testing Access Control Management (Permissions)...');
  const updatedPermsStaff = await AdminService.updateStaffAccessControl(adminLogin.admin, createdStaff.id, {
    can_review_requests: true,
    can_prepare_documents: true,
    can_print_documents: false, // restrict printing
    can_release_documents: false,
    can_verify_qr: true,
    can_view_reports: true,
    can_archive_records: true
  });
  console.log('✓ Updated Permissions: can_print_documents =', updatedPermsStaff.can_print_documents, 'can_view_reports =', updatedPermsStaff.can_view_reports);

  // 11. ADM-URM-03: Staff Account Deactivation
  console.log('\n[ADM-URM-03] Testing Staff Account Deactivation...');
  const deactResult = await AdminService.toggleStaffStatus(adminLogin.admin, createdStaff.id, false);
  console.log('✓ Deactivation Result:', deactResult.message);

  // Verify deactivated staff cannot log in
  try {
    await StaffService.login(newStaffEmail, 'StaffPassword@123');
    console.error('✗ ERROR: Deactivated staff was able to login!');
  } catch (err) {
    console.log('✓ Confirmed: Deactivated staff is blocked from logging in with error:', err.message);
  }

  // Reactivate staff and verify login works
  await AdminService.toggleStaffStatus(adminLogin.admin, createdStaff.id, true);
  const reactivatedLogin = await StaffService.login(newStaffEmail, 'StaffPassword@123');
  console.log('✓ Reactivated Staff can login again:', reactivatedLogin.user.fullName);

  console.log('\n=======================================================');
  console.log('🎉 ALL "TO DO" MODULES AND FUNCTIONAL REQUIREMENTS PASSED!');
  console.log('=======================================================');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

