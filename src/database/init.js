const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../config/db');

function initDatabase() {
  const db = getDatabase();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema tables
  db.exec(schemaSql);

  // Ensure public uploads directory exists
  const uploadsDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Salt for all seed accounts
  const salt = bcrypt.genSaltSync(10);

  // Check if admin user already exists, seed if not
  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  if (!existingAdmin) {
    const adminPasswordHash = bcrypt.hashSync('Admin@123456', salt);

    const insertAdmin = db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name, phone, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const adminResult = insertAdmin.run(
      'admin@quickfile.gov.ph',
      adminPasswordHash,
      'admin',
      'Hon. Barangay Captain / Super Admin',
      '09170000001'
    );
    console.log(`[QuickFile DB] Seeded default administrator (admin@quickfile.gov.ph / Admin@123456)`);

    // Also seed a default staff account for instant testing
    const staffPasswordHash = bcrypt.hashSync('Staff@123456', salt);
    const staffResult = insertAdmin.run(
      'staff@quickfile.gov.ph',
      staffPasswordHash,
      'staff',
      'Maria Santos (Barangay Staff)',
      '09170000002'
    );
    const staffUserId = staffResult.lastInsertRowid;

    // Staff details
    db.prepare(`
      INSERT INTO staff_details (user_id, employee_id, position, department)
      VALUES (?, ?, ?, ?)
    `).run(staffUserId, 'BRGY-STF-001', 'Document Processing Clerk', 'Barangay Document Services');

    // Staff permissions (ADM-URM-04)
    db.prepare(`
      INSERT INTO staff_permissions (
        user_id, can_review_requests, can_prepare_documents, 
        can_print_documents, can_release_documents, can_verify_qr, 
        can_view_reports, can_archive_records
      ) VALUES (?, 1, 1, 1, 1, 1, 1, 1)
    `).run(staffUserId);

    console.log(`[QuickFile DB] Seeded default staff (staff@quickfile.gov.ph / Staff@123456)`);

    // Seed a sample citizen with an initialized profile
    const citizenPasswordHash = bcrypt.hashSync('Citizen@123456', salt);
    const citizenResult = insertAdmin.run(
      'citizen@quickfile.gov.ph',
      citizenPasswordHash,
      'citizen',
      'Juan Dela Cruz',
      '09170000003'
    );
    const citizenUserId = citizenResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO citizen_profiles (
        user_id, first_name, middle_name, last_name, suffix,
        birthdate, gender, civil_status, purok_zone, street_address,
        contact_number, occupation, voter_status,
        emergency_contact_name, emergency_contact_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      citizenUserId,
      'Juan',
      'Protacio',
      'Dela Cruz',
      '',
      '1995-06-19',
      'Male',
      'Single',
      'Zone 3',
      '124 Mabini St.',
      '09170000003',
      'Freelancer',
      'Registered',
      'Maria Dela Cruz',
      '09170000004'
    );
    console.log(`[QuickFile DB] Seeded sample citizen (citizen@quickfile.gov.ph / Citizen@123456)`);
  }

  // Seed notification testing citizen account if not exists
  const existingNotificationUser = db.prepare('SELECT id FROM users WHERE email = ?').get('quickfile.notification@gmail.com');
  if (!existingNotificationUser) {
    const notifCitizenHash = bcrypt.hashSync('Password123!', salt);
    const notifUserResult = db.prepare(`
      INSERT INTO users (email, password_hash, role, full_name, phone)
      VALUES (?, ?, 'citizen', ?, ?)
    `).run('quickfile.notification@gmail.com', notifCitizenHash, 'QuickFile Demo Citizen', '09170009999');
    
    db.prepare(`
      INSERT INTO citizen_profiles (user_id, first_name, last_name, purok_zone, street_address, contact_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(notifUserResult.lastInsertRowid, 'QuickFile', 'Citizen', 'Purok Central', 'Barangay Hall Complex', '09170009999');
  }

  // Ensure default staff (staff@quickfile.gov.ph) has all operational permissions enabled
  try {
    db.prepare(`
      UPDATE staff_permissions 
      SET can_review_requests = 1, can_prepare_documents = 1, can_print_documents = 1,
          can_release_documents = 1, can_verify_qr = 1, can_view_reports = 1, can_archive_records = 1
      WHERE user_id IN (SELECT id FROM users WHERE email = 'staff@quickfile.gov.ph')
    `).run();
  } catch (e) {
    // Ignore if table not yet initialized
  }

  // Ensure default app settings exist (pluggable integrations & dual-tier Default vs Custom configuration)
  const defaultSettings = [
    // Feature enable/disable toggles
    { key: 'google_auth_enabled', value: '0', category: 'auth_integration', description: 'Enable/Disable Google OAuth One-Click Sign-In for Citizens' },
    { key: 'sms_notifications_enabled', value: '1', category: 'communication', description: 'Enable/Disable SMS Gateway Notifications (Twilio / PhilSMS)' },
    { key: 'email_smtp_enabled', value: '1', category: 'communication', description: 'Enable/Disable Automated Email Delivery via SMTP' },
    { key: 'qr_engine_enabled', value: '1', category: 'verification', description: 'Enable/Disable Internal QR Verification Engine' },
    { key: 'api_enabled', value: '1', category: 'api_integration', description: 'Enable/Disable REST API Endpoints and External Developer Gateway' },

    // Configuration Source Selectors: 'default' (Developer Presets) vs 'custom' (Client/Admin Configured)
    { key: 'smtp_config_source', value: 'default', category: 'communication', description: 'Active SMTP Config Source (default or custom)' },
    { key: 'google_config_source', value: 'default', category: 'auth_integration', description: 'Active Google Auth Config Source (default or custom)' },
    { key: 'sms_config_source', value: 'default', category: 'communication', description: 'Active SMS Config Source (default or custom)' },
    { key: 'api_config_source', value: 'default', category: 'api_integration', description: 'Active REST API Config Source (default or custom)' },

    // Client Custom Overrides (Set via Web UI or CUSTOM_* env)
    { key: 'custom_smtp_host', value: '', category: 'communication', description: 'Custom Client SMTP Host' },
    { key: 'custom_smtp_port', value: '465', category: 'communication', description: 'Custom Client SMTP Port' },
    { key: 'custom_smtp_secure', value: '1', category: 'communication', description: 'Custom Client SMTP SSL/TLS' },
    { key: 'custom_smtp_user', value: '', category: 'communication', description: 'Custom Client SMTP Username/Email' },
    { key: 'custom_smtp_pass', value: '', category: 'communication', description: 'Custom Client SMTP Password' },
    { key: 'custom_smtp_from', value: '', category: 'communication', description: 'Custom Client SMTP Sender Header' },

    { key: 'custom_google_client_id', value: '', category: 'auth_integration', description: 'Custom Client Google OAuth Client ID' },
    { key: 'custom_google_client_secret', value: '', category: 'auth_integration', description: 'Custom Client Google OAuth Client Secret' },

    { key: 'custom_sms_provider', value: '', category: 'communication', description: 'Custom Client SMS Provider' },
    { key: 'custom_sms_api_key', value: '', category: 'communication', description: 'Custom Client SMS API Key' },
    { key: 'custom_sms_sender_id', value: '', category: 'communication', description: 'Custom Client SMS Sender ID' },

    { key: 'custom_api_secret_key', value: '', category: 'api_integration', description: 'Custom Client REST API Secret Key' },

    // Legacy compatibility keys
    { key: 'google_client_id', value: '', category: 'auth_integration', description: 'Google OAuth Client ID (legacy)' },
    { key: 'google_client_secret', value: '', category: 'auth_integration', description: 'Google OAuth Client Secret (legacy)' },
    { key: 'api_secret_key', value: '', category: 'api_integration', description: 'API Secret Key for External Integrations (legacy)' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value, category, description)
    VALUES (?, ?, ?, ?)
  `);

  for (const s of defaultSettings) {
    insertSetting.run(s.key, s.value, s.category, s.description);
  }

  // Seed default Document Types (CIT-DCR & ADM-DTM)
  const defaultDocTypes = [
    {
      code: 'BRGY_CLEARANCE',
      name: 'Barangay Clearance',
      description: 'Official clearance certified for employment, local travel, postal ID, or general legal verification.',
      fee: 50.00,
      processing_days: 1,
      requirements_text: '1. Valid Government-Issued ID\n2. Proof of residency (Utility bill / Lease contract)\n3. 2x2 colored ID picture'
    },
    {
      code: 'INDIGENCY',
      name: 'Certificate of Indigency',
      description: 'Certified document establishing resident indigent status for scholarship, medical, or financial assistance.',
      fee: 0.00,
      processing_days: 1,
      requirements_text: '1. Valid ID of applicant or guardian\n2. Case study or endorsement from Barangay Kagawad\n3. Proof of low or no income'
    },
    {
      code: 'RESIDENCY',
      name: 'Certificate of Residency',
      description: 'Proof of actual residence within the barangay jurisdiction for bank accounts, court filings, and utility applications.',
      fee: 50.00,
      processing_days: 1,
      requirements_text: '1. Valid ID showing resident address\n2. Barangay voter certification or Purok leader confirmation'
    },
    {
      code: 'BUSINESS_CLEARANCE',
      name: 'Barangay Business Clearance',
      description: 'Required clearance prior to mayor\'s permit and commercial operation within the barangay boundaries.',
      fee: 250.00,
      processing_days: 2,
      requirements_text: '1. DTI or SEC Registration Certificate\n2. Commercial lease contract or property title\n3. Fire Safety Inspection Clearance'
    },
    {
      code: 'BARANGAY_ID',
      name: 'Barangay Resident ID Card',
      description: 'Official Barangay Community identification card with QR verification and emergency details.',
      fee: 100.00,
      processing_days: 3,
      requirements_text: '1. Proof of at least 6 months residency\n2. Formal 2x2 photograph with white background\n3. Emergency contact confirmation'
    }
  ];

  const insertDocType = db.prepare(`
    INSERT OR IGNORE INTO document_types (code, name, description, fee, processing_days, requirements_text, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  for (const dt of defaultDocTypes) {
    insertDocType.run(dt.code, dt.name, dt.description, dt.fee, dt.processing_days, dt.requirements_text);
  }

  // Seed sample requests if table is empty
  const requestCount = db.prepare('SELECT COUNT(*) as count FROM document_requests').get().count;
  if (requestCount === 0) {
    const citizen = db.prepare('SELECT id, full_name, phone FROM users WHERE role = ? LIMIT 1').get('citizen');
    const clearanceDoc = db.prepare('SELECT id, name, fee FROM document_types WHERE code = ? LIMIT 1').get('BRGY_CLEARANCE');
    const indigencyDoc = db.prepare('SELECT id, name, fee FROM document_types WHERE code = ? LIMIT 1').get('INDIGENCY');

    if (citizen && clearanceDoc && indigencyDoc) {
      const sampleFormData = JSON.stringify({
        fullName: citizen.full_name,
        contactNumber: citizen.phone,
        completeAddress: '124 Mabini St., Zone 3, Barangay Central',
        civilStatus: 'Single',
        gender: 'Male',
        occupation: 'Freelancer',
        voterStatus: 'Registered'
      });

      // Request 1: Released certificate with QR code
      const req1 = db.prepare(`
        INSERT INTO document_requests (
          tracking_number, user_id, document_type_id, purpose, form_data,
          status, fee, payment_status, released_at
        ) VALUES (?, ?, ?, ?, ?, 'RELEASED', ?, 'PAID', CURRENT_TIMESTAMP)
      `).run('QF-20261018-0001', citizen.id, clearanceDoc.id, 'Job Application - Software Engineer', sampleFormData, clearanceDoc.fee);

      const verificationCode = 'QF-VER-982341';
      const certNumber = 'CERT-2026-0001';
      const qrData = `http://localhost:3000/verify/${verificationCode}`;

      db.prepare(`
        INSERT INTO issued_documents (
          request_id, certificate_number, verification_code, qr_data,
          issued_to_name, document_name, validity_status, issued_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'VALID', CURRENT_TIMESTAMP)
      `).run(req1.lastInsertRowid, certNumber, verificationCode, qrData, citizen.full_name, clearanceDoc.name);

      // Request 2: Pending request in staff queue
      db.prepare(`
        INSERT INTO document_requests (
          tracking_number, user_id, document_type_id, purpose, form_data,
          status, fee, payment_status
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, 'WAIVED')
      `).run('QF-20261018-0002', citizen.id, indigencyDoc.id, 'Educational Assistance for College Semester', sampleFormData, indigencyDoc.fee);

      // Seed an initial notification for citizen
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, link)
        VALUES (?, 'Document Request Released', 'Your Barangay Clearance (Tracking: QF-20261018-0001) has been approved and released.', '/citizen/requests/QF-20261018-0001')
      `).run(citizen.id);
    }
  }

  return db;
}

module.exports = {
  initDatabase
};
