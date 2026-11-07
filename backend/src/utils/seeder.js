const mongoose = require('mongoose');
const { config, validateConfig } = require('../config');
const { connectDB } = require('../config/db');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  DocumentType,
  AppSetting,
  SuperAdminLockout,
} = require('../models');
const { ROLES, VERIFICATION_STATUSES, VOTER_STATUSES } = require('../config/constants');

async function seedDatabase() {
  console.log('[Seeder] Starting database seeding process...');

  // Validate configuration invariants & passwords
  validateConfig();

  // Item 3: Refuse default-account seeding in production unless explicitly authorized
  if (config.isProduction && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error(
      '[Seeder] Refusing to seed default accounts when NODE_ENV=production unless SEED_ALLOW_PRODUCTION=true.'
    );
  }

  const seedPasswords = [
    { role: 'Admin', key: 'DEFAULT_ADMIN_PASSWORD', pass: config.seed.adminPassword },
  ];

  if (!config.isProduction) {
    seedPasswords.push(
      { role: 'Staff', key: 'DEFAULT_STAFF_PASSWORD', pass: config.seed.staffPassword },
      { role: 'Citizen', key: 'DEFAULT_CITIZEN_PASSWORD', pass: config.seed.citizenPassword }
    );
  }

  for (const { role, key, pass } of seedPasswords) {
    if (!pass || pass.trim().length < 8) {
      throw new Error(`[Seeder] Refusing to seed: ${key} is empty or shorter than 8 characters.`);
    }
    if (config.isProduction && pass.trim().toLowerCase().startsWith('change_me')) {
      throw new Error(
        `[Seeder] Refusing to seed in production: ${key} cannot use placeholder value starting with "change_me".`
      );
    }
  }

  // 1. Initialize Super Admin Lockout state
  let lockout = await SuperAdminLockout.findOne();
  if (!lockout) {
    await SuperAdminLockout.create({});
    console.log('[Seeder] Initialized Super Admin lockout state.');
  } else {
    console.log('[Seeder] Super Admin lockout record already exists.');
  }

  // 2. Seed Default Admin Account (Item 3: Only when no user with role admin exists at all)
  const existingAdminCount = await User.countDocuments({ role: ROLES.ADMIN });
  let admin = null;
  if (existingAdminCount === 0) {
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
    admin = await User.findOne({ role: ROLES.ADMIN });
    console.log(`[Seeder] Admin user role already exists. Skipping admin creation.`);
  }

  // 3 & 4. Demo accounts and fake ID data are seeded ONLY when NODE_ENV is not production
  if (!config.isProduction) {
    // Seed Default Staff Account (Only when no user with role staff exists at all)
    const existingStaffCount = await User.countDocuments({ role: ROLES.STAFF });
    if (existingStaffCount === 0) {
      const passwordHash = await User.hashPassword(config.seed.staffPassword);
      const staff = await User.create({
        email: config.seed.staffEmail,
        password_hash: passwordHash,
        full_name: 'Juan Dela Cruz',
        phone: '09171234567',
        role: ROLES.STAFF,
        is_active: true,
      });

      await StaffDetail.create({
        user_id: staff._id,
        employee_id: 'BRGY-STAFF-001',
        position: 'Document Processing Officer',
        department: 'Records & Documentation',
        contact_number: '09171234567',
      });

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
      console.log(`[Seeder] Staff user role already exists. Skipping staff creation.`);
    }

    // Seed Default Citizen Account (Only when no user with role citizen exists at all)
    const existingCitizenCount = await User.countDocuments({ role: ROLES.CITIZEN });
    if (existingCitizenCount === 0) {
      const passwordHash = await User.hashPassword(config.seed.citizenPassword);
      const citizen = await User.create({
        email: config.seed.citizenEmail,
        password_hash: passwordHash,
        full_name: 'Maria Santos Clara',
        phone: '09187654321',
        role: ROLES.CITIZEN,
        is_active: true,
      });

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
        barangay: config.jurisdiction.barangayName(),
        city: config.jurisdiction.cityMunicipality(),
        province: config.jurisdiction.province(),
        occupation: 'Office Clerk',
        voter_status: VOTER_STATUSES.REGISTERED,
        emergency_contact_name: 'Jose Clara',
        emergency_contact_number: '09191112233',
        valid_id_type: 'Passport',
        valid_id_number: 'P1234567A',
        proof_of_residency_type: 'Utility Bill',
        verification_status: VERIFICATION_STATUSES.VERIFIED,
        verified_at: new Date(),
        verified_by: admin ? admin._id : null,
      });

      console.log(`[Seeder] Seeded default citizen user: ${config.seed.citizenEmail}`);
    } else {
      console.log(`[Seeder] Citizen user role already exists. Skipping citizen creation.`);
    }
  } else {
    console.log('[Seeder] Production mode: skipping demo staff and demo citizen creation.');
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

  // 6. Seed App Settings (Toggles & Metadata only; secret keys stay in .env)
  const defaultSettings = [
    { key: 'system_name', value: 'QuickFile Barangay Portal', category: 'general', description: 'Application display name' },
    { key: 'barangay_name', value: config.jurisdiction.barangayName(), category: 'general', description: 'Name of the barangay' },
    { key: 'city_municipality', value: config.jurisdiction.cityMunicipality(), category: 'general', description: 'City or Municipality' },
    { key: 'province', value: config.jurisdiction.province(), category: 'general', description: 'Province or Region' },
    { key: 'office_name', value: process.env.OFFICE_NAME || 'Office of the Barangay Captain', category: 'general', description: 'Office name for issued certificates' },
    { key: 'barangay_captain', value: process.env.BARANGAY_CAPTAIN_NAME || '', category: 'general', description: 'Name of the Barangay Captain (Punong Barangay)' },
    { key: 'barangay_secretary', value: process.env.BARANGAY_SECRETARY_NAME || '', category: 'general', description: 'Name of the Barangay Secretary' },
    { key: 'contact_email', value: 'info@quickfile.gov.ph', category: 'general', description: 'Public contact email' },
    { key: 'contact_phone', value: '+63 912 345 6789', category: 'general', description: 'Public contact phone' },
    { key: 'enable_sms_notifications', value: false, category: 'notifications', description: 'Toggle PhilSMS notifications' },
    { key: 'enable_email_notifications', value: false, category: 'notifications', description: 'Toggle SMTP email notifications' },
    { key: 'enable_google_login', value: false, category: 'integrations', description: 'Toggle Google OAuth login' },
    { key: 'enable_recaptcha', value: false, category: 'integrations', description: 'Toggle Google reCAPTCHA v2' },
    { key: 'enable_rest_api_gateway', value: false, category: 'integrations', description: 'Toggle External REST API gateway at /api/v1/external' },
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
