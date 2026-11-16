/**
 * QuickFile Frontend Type Definitions
 */

export type Role = 'citizen' | 'staff' | 'admin';

export type RequestStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'in_preparation'
  | 'ready_for_pickup'
  | 'released'
  | 'rejected'
  | 'archived'
  | 'cancelled';
