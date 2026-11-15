/**
 * QuickFile Backend Type Definitions
 */

export interface User {
  _id: string;
  email: string;
  role: 'citizen' | 'staff' | 'admin';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentRequest {
  _id: string;
  tracking_number: string;
  citizen_id: string;
  document_type_id: string;
  status: string;
  created_at: Date;
}
