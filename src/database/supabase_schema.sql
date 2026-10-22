-- ========================================================================
-- QuickFile: Supabase PostgreSQL Complete Database Schema & Initial Seeds
-- Project: https://bnuwahmsxxqqfuwwhzqk.supabase.co
-- ========================================================================

-- Enable pgcrypto for UUIDs and password hashing if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('citizen', 'staff', 'admin')),
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Citizen Profiles Table
CREATE TABLE IF NOT EXISTS public.citizen_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Staff Details Table
CREATE TABLE IF NOT EXISTS public.staff_details (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_id TEXT UNIQUE,
  position TEXT,
  department TEXT DEFAULT 'Barangay Document Services',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Staff Permissions Table
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_review_requests INTEGER DEFAULT 1 NOT NULL,
  can_prepare_documents INTEGER DEFAULT 1 NOT NULL,
  can_print_documents INTEGER DEFAULT 1 NOT NULL,
  can_release_documents INTEGER DEFAULT 1 NOT NULL,
  can_verify_qr INTEGER DEFAULT 1 NOT NULL,
  can_view_reports INTEGER DEFAULT 0 NOT NULL,
  can_archive_records INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Password Resets Table
CREATE TABLE IF NOT EXISTS public.password_resets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT,
  actor_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id BIGINT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. App Settings Table
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'integration',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Document Types Catalog
CREATE TABLE IF NOT EXISTS public.document_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fee NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  processing_days INTEGER DEFAULT 1 NOT NULL,
  requirements_text TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Document Requests Table
CREATE TABLE IF NOT EXISTS public.document_requests (
  id BIGSERIAL PRIMARY KEY,
  tracking_number TEXT UNIQUE NOT NULL,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type_id BIGINT NOT NULL REFERENCES public.document_types(id),
  purpose TEXT NOT NULL,
  form_data TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  status TEXT DEFAULT 'PENDING' NOT NULL CHECK(status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'IN_PREPARATION', 'READY_FOR_PICKUP', 'RELEASED', 'REJECTED', 'ARCHIVED')),
  rejection_reason TEXT,
  fee NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  payment_status TEXT DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID', 'PAID', 'WAIVED')),
  reviewed_by BIGINT,
  prepared_by BIGINT,
  released_by BIGINT,
  released_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Issued Documents & QR Codes Table
CREATE TABLE IF NOT EXISTS public.issued_documents (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT UNIQUE NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  certificate_number TEXT UNIQUE NOT NULL,
  verification_code TEXT UNIQUE NOT NULL,
  qr_data TEXT NOT NULL,
  qr_code_image TEXT,
  issued_to_name TEXT NOT NULL,
  document_name TEXT NOT NULL,
  validity_status TEXT DEFAULT 'VALID' CHECK(validity_status IN ('VALID', 'EXPIRED', 'REVOKED')),
  issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

-- 11. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================================
-- Indexes for Performance
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_requests_tracking ON public.document_requests(tracking_number);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON public.document_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.document_requests(status);
CREATE INDEX IF NOT EXISTS idx_issued_cert_num ON public.issued_documents(certificate_number);
CREATE INDEX IF NOT EXISTS idx_issued_verif_code ON public.issued_documents(verification_code);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- ========================================================================
-- Seed Initial Data
-- ========================================================================

-- Seed Admin (Password: Admin@123456)
INSERT INTO public.users (email, password_hash, role, full_name, phone, is_active)
VALUES (
  'admin@quickfile.gov.ph',
  '$2a$10$w095V1eZ2vVl6Nq12aIqsePauH4a7l8rB4p6Nq7n.e7I9zC2H1Y4m',
  'admin',
  'Hon. Barangay Captain / Super Admin',
  '09170000001',
  1
) ON CONFLICT (email) DO NOTHING;

-- Seed Staff (Password: Staff@123456)
INSERT INTO public.users (email, password_hash, role, full_name, phone, is_active)
VALUES (
  'staff@quickfile.gov.ph',
  '$2a$10$g1kK2w095V1eZ2vVl6Nq1ePauH4a7l8rB4p6Nq7n.e7I9zC2H1Y4m',
  'staff',
  'Maria Santos (Barangay Staff)',
  '09170000002',
  1
) ON CONFLICT (email) DO NOTHING;

-- Seed Citizen (Password: Citizen@123456)
INSERT INTO public.users (email, password_hash, role, full_name, phone, is_active)
VALUES (
  'citizen@quickfile.gov.ph',
  '$2a$10$C1t1z3n123456HashDummyValueForInitialSetupPlzRegOrUseMain12',
  'citizen',
  'Juan Dela Cruz',
  '09170000003',
  1
) ON CONFLICT (email) DO NOTHING;

-- Seed Demo Citizen for Notifications
INSERT INTO public.users (email, password_hash, role, full_name, phone, is_active)
VALUES (
  'quickfile.notification@gmail.com',
  '$2a$10$C1t1z3n123456HashDummyValueForInitialSetupPlzRegOrUseMain12',
  'citizen',
  'QuickFile Demo Citizen',
  '09170009999',
  1
) ON CONFLICT (email) DO NOTHING;

-- Link Staff Details and Permissions
DO $$
DECLARE
  staff_uid BIGINT;
  citizen_uid BIGINT;
BEGIN
  SELECT id INTO staff_uid FROM public.users WHERE email = 'staff@quickfile.gov.ph' LIMIT 1;
  IF staff_uid IS NOT NULL THEN
    INSERT INTO public.staff_details (user_id, employee_id, position, department)
    VALUES (staff_uid, 'BRGY-STF-001', 'Document Processing Clerk', 'Barangay Document Services')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.staff_permissions (
      user_id, can_review_requests, can_prepare_documents,
      can_print_documents, can_release_documents, can_verify_qr,
      can_view_reports, can_archive_records
    ) VALUES (staff_uid, 1, 1, 1, 1, 1, 1, 1)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT id INTO citizen_uid FROM public.users WHERE email = 'citizen@quickfile.gov.ph' LIMIT 1;
  IF citizen_uid IS NOT NULL THEN
    INSERT INTO public.citizen_profiles (
      user_id, first_name, middle_name, last_name, suffix,
      birthdate, gender, civil_status, purok_zone, street_address,
      contact_number, occupation, voter_status,
      emergency_contact_name, emergency_contact_number
    ) VALUES (
      citizen_uid, 'Juan', 'Protacio', 'Dela Cruz', '',
      '1995-06-19', 'Male', 'Single', 'Zone 3', '124 Mabini St.',
      '09170000003', 'Freelancer', 'Registered',
      'Maria Dela Cruz', '09170000004'
    ) ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- Seed Document Types Catalog
INSERT INTO public.document_types (code, name, description, fee, processing_days, requirements_text, is_active)
VALUES
  ('BRGY_CLEARANCE', 'Barangay Clearance', 'Official clearance certified for employment, local travel, postal ID, or general legal verification.', 50.00, 1, '1. Valid Government-Issued ID\n2. Proof of residency (Utility bill / Lease contract)\n3. 2x2 colored ID picture', 1),
  ('INDIGENCY', 'Certificate of Indigency', 'Certified document establishing resident indigent status for scholarship, medical, or financial assistance.', 0.00, 1, '1. Valid ID of applicant or guardian\n2. Case study or endorsement from Barangay Kagawad\n3. Proof of low or no income', 1),
  ('RESIDENCY', 'Certificate of Residency', 'Proof of actual residence within the barangay jurisdiction for bank accounts, court filings, and utility applications.', 50.00, 1, '1. Valid ID showing resident address\n2. Barangay voter certification or Purok leader confirmation', 1),
  ('BUSINESS_CLEARANCE', 'Barangay Business Clearance', 'Required clearance prior to mayor''s permit and commercial operation within the barangay boundaries.', 250.00, 2, '1. DTI or SEC Registration Certificate\n2. Commercial lease contract or property title\n3. Fire Safety Inspection Clearance', 1),
  ('BARANGAY_ID', 'Barangay Resident ID Card', 'Official Barangay Community identification card with QR verification and emergency details.', 100.00, 3, '1. Proof of at least 6 months residency\n2. Formal 2x2 photograph with white background\n3. Emergency contact confirmation', 1)
ON CONFLICT (code) DO NOTHING;

-- Seed Default App Settings
INSERT INTO public.app_settings (key, value, category, description)
VALUES
  ('google_auth_enabled', '0', 'auth_integration', 'Enable/Disable Google OAuth One-Click Sign-In for Citizens'),
  ('google_client_id', '', 'auth_integration', 'Google OAuth Client ID'),
  ('google_client_secret', '', 'auth_integration', 'Google OAuth Client Secret'),
  ('sms_notifications_enabled', '1', 'communication', 'Enable/Disable SMS Gateway Notifications (Twilio / PhilSMS)'),
  ('email_smtp_enabled', '1', 'communication', 'Enable/Disable Automated Email Delivery via SMTP'),
  ('qr_engine_enabled', '1', 'verification', 'Enable/Disable Internal QR Verification Engine'),
  ('api_enabled', '1', 'api_integration', 'Enable/Disable REST API Endpoints and External Developer Gateway'),
  ('api_secret_key', '', 'api_integration', 'API Secret Key for External Integrations')
ON CONFLICT (key) DO NOTHING;

-- Disable Row Level Security (RLS) on public tables so application service role key has direct full access
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.citizen_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_resets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.document_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.document_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.issued_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications DISABLE ROW LEVEL SECURITY;

