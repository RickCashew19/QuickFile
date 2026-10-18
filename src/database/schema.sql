-- QuickFile Database Schema
-- Modules: CIT (IAM, APM, DCR, ODR, RST, RHV)
--          STF (IAM, RVP, RSM, DPP, RA, QDV, TR)
--          ADM (IAM, DB, URM, DTM, TR, CRS, IDV, SAO)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('citizen', 'staff', 'admin')),
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS citizen_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  suffix TEXT,
  birthdate TEXT,
  gender TEXT,
  civil_status TEXT,
  purok_zone TEXT,
  street_address TEXT,
  contact_number TEXT,
  occupation TEXT,
  voter_status TEXT,
  emergency_contact_name TEXT,
  emergency_contact_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  employee_id TEXT UNIQUE,
  position TEXT,
  department TEXT DEFAULT 'Barangay Document Services',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  can_review_requests INTEGER DEFAULT 1 NOT NULL,
  can_prepare_documents INTEGER DEFAULT 1 NOT NULL,
  can_print_documents INTEGER DEFAULT 1 NOT NULL,
  can_release_documents INTEGER DEFAULT 1 NOT NULL,
  can_verify_qr INTEGER DEFAULT 1 NOT NULL,
  can_view_reports INTEGER DEFAULT 0 NOT NULL,
  can_archive_records INTEGER DEFAULT 0 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  is_used INTEGER DEFAULT 0 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'integration',
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CIT-DCR & ADM-DTM: Document Types and Requirements Catalog
CREATE TABLE IF NOT EXISTS document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fee REAL DEFAULT 0.00 NOT NULL,
  processing_days INTEGER DEFAULT 1 NOT NULL,
  requirements_text TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CIT-ODR, CIT-RST, CIT-RHV, STF-RVP, STF-RSM, STF-DPP, STF-RA: Online Document Requests
CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_number TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  document_type_id INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  form_data TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  status TEXT DEFAULT 'PENDING' NOT NULL CHECK(status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'IN_PREPARATION', 'READY_FOR_PICKUP', 'RELEASED', 'REJECTED', 'ARCHIVED')),
  rejection_reason TEXT,
  fee REAL DEFAULT 0.00 NOT NULL,
  payment_status TEXT DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID', 'PAID', 'WAIVED')),
  reviewed_by INTEGER,
  prepared_by INTEGER,
  released_by INTEGER,
  released_at DATETIME,
  archived_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id)
);

-- STF-DPP, STF-QDV, CIT-RHV-02, ADM-IDV: Issued Barangay Documents & QR Authentications
CREATE TABLE IF NOT EXISTS issued_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER UNIQUE NOT NULL,
  certificate_number TEXT UNIQUE NOT NULL,
  verification_code TEXT UNIQUE NOT NULL,
  qr_data TEXT NOT NULL,
  qr_code_image TEXT,
  issued_to_name TEXT NOT NULL,
  document_name TEXT NOT NULL,
  validity_status TEXT DEFAULT 'VALID' CHECK(validity_status IN ('VALID', 'EXPIRED', 'REVOKED')),
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  revoked_at DATETIME,
  revoked_reason TEXT,
  FOREIGN KEY (request_id) REFERENCES document_requests(id) ON DELETE CASCADE
);

-- CIT-RST-02 & STF-RSM-02: In-App System Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER DEFAULT 0 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
