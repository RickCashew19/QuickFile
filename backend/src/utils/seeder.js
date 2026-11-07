const mongoose = require('mongoose');
const config = require('../config');
const { connectDB } = require('../config/db');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  DocumentType,
  AppSetting,
  SuperAdminPin,
} = require('../models');
const { ROLES, VERIFICATION_STATUSES, VOTER_STATUSES } = require('../config/constants');

async function seedDatabase() {
  console.log('[Seeder] Starting database seeding process...');

  // Requirement 8: No hardcoded fallback PIN. Stop with a clear error if missing in .env
  const rawPin = process.env.SUPER_ADMIN_PIN;
  if (!rawPin || !rawPin.trim()) {
    throw new Error(
      '[Seeder] Error: SUPER_ADMIN_PIN is missing in .env. Please configure SUPER_ADMIN_PIN in .env before running the seeder.'
    );
  }

  // 1. Seed Super Admin PIN (Never print the PIN)
  const existingPin = await SuperAdminPin.findOne();
  if (!existingPin) {
    const hashedPin = await SuperAdminPin.hashPin(rawPin.trim());
    await SuperAdminPin.create({ pin_hash: hashedPin });
    console.log('[Seeder] Seeded Super Admin PIN successfully.');
  } else {
    console.log('[Seeder] Super Admin PIN already configured. Skipping.');
  }

  // 2. Seed Default Admin Account (Never print passwords)
  let admin = await User.findOne({ email: config.seed.adminEmail });
  if (!admin) {
    const passwordHash = await User.hashPassword(config.seed.adminPassword);
    admin = await User.create({
      email: config.seed.adminEmail,
      password_hash: passwordHash,
      full_name: 'Barangay Administrator',
      phone: '09170000001',
      role: ROLES.ADMIN,
      is_active: true,
    });
    console.log(`[Seeder] Seeded default admin user: ${config.seed.adminEmail}`);
  } else {
    console.log(`[Seeder] Admin user already exists: ${config.seed.adminEmail}`);
  }

  // 3. Seed Default Staff Account
  let staff = await User.findOne({ email: config.seed.staffEmail });
  if (!staff) {
    const passwordHash = await User.hashPassword(config.seed.staffPassword);
    staff = await User.create({
      email: config.seed.staffEmail,
      password_hash: passwordHash,
      full_name: 'Juan Dela Cruz',
      phone: '09171234567',
      role: ROLES.STAFF,
      is_active: true,
    });

    await StaffDetail.create({
      user_id: staff._id,
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      employee_id: 'BRGY-STAFF-001',
      position: 'Document Processing Officer',
      department: 'Records & Documentation',
      contact_number: '09171234567',
    });

    // Requirement 2: Cleaned staff permissions
    await StaffPermission.create({
      user_id: staff._id,
      can_review_requests: true,
      can_prepare_documents: true,
      can_print_documents: true,
      can_release_documents: true,
      can_verify_qr: true,
      can_view_reports: true,
      can_archive_records: true,
    });

    console.log(`[Seeder] Seeded default staff user: ${config.seed.staffEmail}`);
  } else {
    console.log(`[Seeder] Staff user already exists: ${config.seed.staffEmail}`);
  }

  // 4. Seed Default Citizen Account
  let citizen = await User.findOne({ email: config.seed.citizenEmail });
  if (!citizen) {
    const passwordHash = await User.hashPassword(config.seed.citizenPassword);
    citizen = await User.create({
      email: config.seed.citizenEmail,
      password_hash: passwordHash,
      full_name: 'Maria Santos Clara',
      phone: '09187654321',
      role: ROLES.CITIZEN,
      is_active: true,
    });

    // Requirement 4: Restored CitizenProfile fields
    await CitizenProfile.create({
      user_id: citizen._id,
      first_name: 'Maria',
      middle_name: 'Santos',
      last_name: 'Clara',
      suffix: '',
      birthdate: new Date('1995-06-15'),
      gender: 'female',
      civil_status: 'single',
      contact_number: '09187654321',
      purok_zone: 'Zone 4',
      street_address: '123 Rizal Street',
      barangay: 'San Antonio',
      city: 'Pasig City',
      province: 'Metro Manila',
      occupation: 'Office Clerk',
      voter_status: VOTER_STATUSES.REGISTERED,
      emergency_contact_name: 'Jose Clara',
      emergency_contact_number: '09191112233',
      valid_id_type: 'Passport',
      valid_id_number: 'P1234567A',
      proof_of_residency_type: 'Utility Bill',
      verification_status: VERIFICATION_STATUSES.VERIFIED,
      verified_at: new Date(),
      verified_by: admin._id,
    });

    console.log(`[Seeder] Seeded default citizen user: ${config.seed.citizenEmail}`);
  } else {
    console.log(`[Seeder] Citizen user already exists: ${config.seed.citizenEmail}`);
  }

  // 5. Seed Document Types
  const documentTypes = [
    {
      code: 'BC',
      name: 'Barangay Clearance',
      description: 'Official clearance issued for employment, business, or residency certification purposes.',
      fee: 50.0,
      processing_days: 1,
      requirements: ['Valid Government ID', 'Proof of Residency'],
    },
    {
      code: 'COI',
      name: 'Certificate of Indigency',
      description: 'Document verifying indigency for scholarship, medical assistance, or legal aid.',
      fee: 0.0,
      processing_days: 1,
      requirements: ['Valid Government ID', 'Case Assessment / Endorsement'],
    },
    {
      code: 'COR',
      name: 'Certificate of Residency',
      description: 'Certificate certifying resident status within the barangay jurisdiction.',
      fee: 50.0,
      processing_days: 1,
      requirements: ['Valid Government ID', 'Utility Bill or Lease Contract'],
    },
    {
      code: 'BUS-CLR',
      name: 'Barangay Business Clearance',
      description: 'Permit clearance required for local business registration and renewal.',
      fee: 150.0,
      processing_days: 2,
      requirements: ['DTI / SEC Registration', 'Lease Contract or Land Title'],
    },
  ];

  for (const doc of documentTypes) {
    const existing = await DocumentType.findOne({ code: doc.code });
    if (!existing) {
      await DocumentType.create(doc);
      console.log(`[Seeder] Seeded document type: ${doc.name} (${doc.code})`);
    }
  }

  // 6. Seed App Settings (Toggles only; secret keys stay in .env)
  const defaultSettings = [
    { key: 'system_name', value: 'QuickFile Barangay Portal', category: 'general', description: 'Application display name' },
    { key: 'barangay_name', value: 'Barangay San Antonio', category: 'general', description: 'Name of the barangay' },
    { key: 'city_municipality', value: 'Pasig City', category: 'general', description: 'City or Municipality' },
    { key: 'province', value: 'Metro Manila', category: 'general', description: 'Province or Region' },
    { key: 'contact_email', value: 'info@quickfile.gov.ph', category: 'general', description: 'Public contact email' },
    { key: 'contact_phone', value: '+63 912 345 6789', category: 'general', description: 'Public contact phone' },
    { key: 'enable_sms_notifications', value: false, category: 'notifications', description: 'Toggle PhilSMS notifications' },
    { key: 'enable_email_notifications', value: false, category: 'notifications', description: 'Toggle SMTP email notifications' },
    { key: 'enable_google_login', value: false, category: 'integrations', description: 'Toggle Google OAuth login' },
    { key: 'enable_recaptcha', value: false, category: 'integrations', description: 'Toggle Google reCAPTCHA v2' },
    { key: 'enable_rest_api_gateway', value: false, category: 'integrations', description: 'Toggle External REST API gateway at /api/external/v1' },
  ];

  for (const s of defaultSettings) {
    const existing = await AppSetting.findOne({ key: s.key });
    if (!existing) {
      await AppSetting.create(s);
    }
  }
  console.log('[Seeder] Default application settings verified.');
  console.log('[Seeder] Database seeding completed successfully.');
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await seedDatabase();
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error('[Seeder] Fatal error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { seedDatabase };
