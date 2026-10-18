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

  // Check if admin user already exists, seed if not
  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
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
      ) VALUES (?, 1, 1, 1, 1, 1, 0, 0)
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

  // Ensure default app settings exist (pluggable integrations)
  const defaultSettings = [
    { key: 'google_auth_enabled', value: '0', category: 'auth_integration', description: 'Enable/Disable Google OAuth One-Click Sign-In for Citizens' },
    { key: 'google_client_id', value: '', category: 'auth_integration', description: 'Google OAuth Client ID' },
    { key: 'google_client_secret', value: '', category: 'auth_integration', description: 'Google OAuth Client Secret' },
    { key: 'sms_notifications_enabled', value: '0', category: 'communication', description: 'Enable/Disable SMS Gateway Notifications (Twilio / PhilSMS)' },
    { key: 'email_smtp_enabled', value: '0', category: 'communication', description: 'Enable/Disable Automated Email Delivery via SMTP' },
    { key: 'qr_engine_enabled', value: '1', category: 'verification', description: 'Enable/Disable Internal QR Verification Engine' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value, category, description)
    VALUES (?, ?, ?, ?)
  `);

  for (const s of defaultSettings) {
    insertSetting.run(s.key, s.value, s.category, s.description);
  }

  return db;
}

module.exports = {
  initDatabase
};
