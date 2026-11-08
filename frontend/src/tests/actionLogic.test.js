import { describe, it, expect } from 'vitest';
import { getAvailableActions } from '../utils/actionLogic';
import { REQUEST_STATUSES, STAFF_PERMISSIONS, ROLES } from '../config/constants';

describe('Workflow Action Logic Matrix Suite', () => {
  const allStatuses = Object.values(REQUEST_STATUSES);

  it('verifies that all 9 official statuses are defined', () => {
    expect(allStatuses).toHaveLength(9);
    expect(allStatuses).toEqual([
      'pending',
      'under_review',
      'approved',
      'in_preparation',
      'ready_for_pickup',
      'released',
      'rejected',
      'archived',
      'cancelled',
    ]);
  });

  it('returns empty array when request or status is missing', () => {
    expect(getAvailableActions(null)).toEqual([]);
    expect(getAvailableActions({})).toEqual([]);
    expect(getAvailableActions({ status: null })).toEqual([]);
  });

  describe('Admin Role Superuser Matrix (all statuses)', () => {
    it.each([
      ['pending', ['review', 'reject']],
      ['under_review', ['approve', 'reject']],
      ['approved', ['prepare', 'reject']],
      ['in_preparation', ['issue']],
      ['ready_for_pickup', ['print', 'release']],
      ['released', ['print', 'archive']],
      ['rejected', ['archive']],
      ['cancelled', ['archive']],
      ['archived', []],
    ])('grants full transition capabilities for status "%s" to admin role', (status, expectedActions) => {
      const actions = getAvailableActions({ status }, {}, ROLES.ADMIN);
      expect(actions).toEqual(expectedActions);
    });
  });

  describe('Staff Role Zero-Permissions Matrix (all statuses)', () => {
    it.each(allStatuses)('grants no actions for status "%s" when staff has no permissions', (status) => {
      const actions = getAvailableActions({ status }, {}, ROLES.STAFF);
      expect(actions).toEqual([]);
    });
  });

  describe('Staff Role Granular Permission Gating Matrix', () => {
    // 1. CAN_REVIEW_REQUESTS
    it('grants review and reject on pending only when CAN_REVIEW_REQUESTS is granted', () => {
      const perms = { [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true };
      expect(getAvailableActions({ status: 'pending' }, perms)).toEqual(['review', 'reject']);
      expect(getAvailableActions({ status: 'pending' }, {})).toEqual([]);
    });

    it('grants approve and reject on under_review only when CAN_REVIEW_REQUESTS is granted', () => {
      const perms = { [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true };
      expect(getAvailableActions({ status: 'under_review' }, perms)).toEqual(['approve', 'reject']);
      expect(getAvailableActions({ status: 'under_review' }, {})).toEqual([]);
    });

    it('grants reject on approved only when CAN_REVIEW_REQUESTS is granted', () => {
      const perms = { [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true };
      expect(getAvailableActions({ status: 'approved' }, perms)).toEqual(['reject']);
    });

    // 2. CAN_PREPARE_DOCUMENTS
    it('grants prepare on approved only when CAN_PREPARE_DOCUMENTS is granted', () => {
      const perms = { [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: true };
      expect(getAvailableActions({ status: 'approved' }, perms)).toEqual(['prepare']);
    });

    it('grants prepare AND reject on approved when staff has both permissions', () => {
      const perms = {
        [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: true,
        [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true,
      };
      expect(getAvailableActions({ status: 'approved' }, perms)).toEqual(['prepare', 'reject']);
    });

    it('grants issue on in_preparation only when CAN_PREPARE_DOCUMENTS is granted', () => {
      const perms = { [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: true };
      expect(getAvailableActions({ status: 'in_preparation' }, perms)).toEqual(['issue']);
      expect(getAvailableActions({ status: 'in_preparation' }, {})).toEqual([]);
    });

    // 3. CAN_PRINT_DOCUMENTS & CAN_RELEASE_DOCUMENTS
    it('gates print and release on ready_for_pickup', () => {
      const printOnly = { [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true };
      const releaseOnly = { [STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS]: true };
      const both = {
        [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true,
        [STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS]: true,
      };

      expect(getAvailableActions({ status: 'ready_for_pickup' }, printOnly)).toEqual(['print']);
      expect(getAvailableActions({ status: 'ready_for_pickup' }, releaseOnly)).toEqual(['release']);
      expect(getAvailableActions({ status: 'ready_for_pickup' }, both)).toEqual(['print', 'release']);
    });

    it('gates print and archive on released', () => {
      const printOnly = { [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true };
      const archiveOnly = { [STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS]: true };
      const both = {
        [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true,
        [STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS]: true,
      };

      expect(getAvailableActions({ status: 'released' }, printOnly)).toEqual(['print']);
      expect(getAvailableActions({ status: 'released' }, archiveOnly)).toEqual(['archive']);
      expect(getAvailableActions({ status: 'released' }, both)).toEqual(['print', 'archive']);
    });

    // 4. CAN_ARCHIVE_RECORDS on terminal statuses
    it.each(['released', 'rejected', 'cancelled'])(
      'grants archive on status "%s" only when CAN_ARCHIVE_RECORDS is present',
      (status) => {
        const perms = { [STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS]: true };
        const actions = getAvailableActions({ status }, perms);
        expect(actions).toContain('archive');

        const noPerms = getAvailableActions({ status }, {});
        expect(noPerms).not.toContain('archive');
      }
    );

    it('never allows any action on archived status regardless of permissions', () => {
      const allPerms = Object.values(STAFF_PERMISSIONS).reduce((acc, p) => {
        acc[p] = true;
        return acc;
      }, {});
      expect(getAvailableActions({ status: 'archived' }, allPerms)).toEqual([]);
    });

    it('supports array format for permissions parameter', () => {
      const permsArray = [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS];
      expect(getAvailableActions({ status: 'pending' }, permsArray)).toEqual(['review', 'reject']);
    });
  });
});
