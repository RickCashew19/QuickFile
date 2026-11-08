import { describe, it, expect } from 'vitest';
import { getAvailableActions } from '../utils/actionLogic';
import { REQUEST_STATUSES, STAFF_PERMISSIONS, ROLES } from '../config/constants';
import backendRules from './fixtures/backendWorkflowRules.json';

describe('Workflow Action Logic Matrix Suite (Derived from Backend Fixture)', () => {
  const allStatuses = Object.values(REQUEST_STATUSES);
  const allPermissions = Object.values(STAFF_PERMISSIONS);

  it('verifies that all 9 official statuses are covered in backend fixture', () => {
    expect(allStatuses).toHaveLength(9);
    const fixtureStatuses = Object.keys(backendRules.ALLOWED_STATUS_TRANSITIONS);
    expect(fixtureStatuses.sort()).toEqual([...allStatuses].sort());
  });

  it('returns empty array when request or status is missing', () => {
    expect(getAvailableActions(null)).toEqual([]);
    expect(getAvailableActions({})).toEqual([]);
    expect(getAvailableActions({ status: null })).toEqual([]);
  });

  describe('Admin Role Matrix (All 9 statuses bypass permissions)', () => {
    const adminExpectedActions = {
      pending: ['review', 'reject'],
      under_review: ['approve', 'reject'],
      approved: ['prepare', 'reject'],
      in_preparation: ['issue'],
      ready_for_pickup: ['print', 'release'],
      released: ['print', 'archive'],
      rejected: ['archive'],
      cancelled: ['archive'],
      archived: [],
    };

    allStatuses.forEach((status) => {
      it(`grants correct superuser actions for status "${status}" to admin`, () => {
        const actions = getAvailableActions({ status, _id: 'req_123' }, {}, ROLES.ADMIN);
        const actionIds = actions.map((a) => a.id);
        expect(actionIds).toEqual(adminExpectedActions[status]);

        // Verify action structure & kinds
        actions.forEach((act) => {
          expect(act).toHaveProperty('id');
          expect(act).toHaveProperty('label');
          expect(['transition', 'link']).toContain(act.kind);
          if (act.kind === 'link') {
            expect(act.href).toBe('/staff/requests/req_123/print');
          } else {
            expect(act).toHaveProperty('nextStatus');
          }
        });
      });
    });
  });

  describe('Staff Role Zero-Permissions Matrix (All 9 statuses)', () => {
    allStatuses.forEach((status) => {
      it(`grants no actions for status "${status}" when staff has no permissions`, () => {
        const actions = getAvailableActions({ status }, {}, ROLES.STAFF);
        expect(actions).toEqual([]);
      });
    });
  });

  describe('Staff Role Granular Permission Matrix (Each status x Single Permission Flag)', () => {
    allStatuses.forEach((status) => {
      allPermissions.forEach((perm) => {
        it(`evaluates status "${status}" with single permission "${perm}"`, () => {
          const perms = { [perm]: true };
          const actions = getAvailableActions({ status, _id: 'req_123' }, perms, ROLES.STAFF);

          actions.forEach((act) => {
            // Find backend definition for this action
            const rule = backendRules.STAFF_ROUTE_PERMISSIONS[act.id];
            expect(rule).toBeDefined();
            // The action's required permission must match the single granted permission
            expect(rule.permission).toBe(perm);
            expect(act.kind).toBe(rule.kind);
          });
        });
      });
    });
  });

  describe('Strict Gating Invariants per Backend Rules', () => {
    it('approved status: allows prepare (can_prepare_documents) AND reject (can_review_requests)', () => {
      const reviewOnly = { [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true };
      const prepOnly = { [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: true };
      const both = {
        [STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS]: true,
        [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: true,
      };

      expect(getAvailableActions({ status: 'approved' }, reviewOnly).map((a) => a.id)).toEqual(['reject']);
      expect(getAvailableActions({ status: 'approved' }, prepOnly).map((a) => a.id)).toEqual(['prepare']);
      expect(getAvailableActions({ status: 'approved' }, both).map((a) => a.id)).toEqual(['prepare', 'reject']);
    });

    it('in_preparation status: gates issue strictly by can_prepare_documents (NOT can_print_documents)', () => {
      const printOnly = { [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true };
      const prepOnly = { [STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS]: true };

      // Printing permission alone MUST NOT grant issue
      expect(getAvailableActions({ status: 'in_preparation' }, printOnly)).toEqual([]);
      // Preparation permission MUST grant issue
      const actions = getAvailableActions({ status: 'in_preparation' }, prepOnly);
      expect(actions.map((a) => a.id)).toEqual(['issue']);
      expect(actions[0].kind).toBe('transition');
      expect(actions[0].nextStatus).toBe('ready_for_pickup');
    });

    it('ready_for_pickup status: print is link action and release is transition action', () => {
      const perms = {
        [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true,
        [STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS]: true,
      };
      const actions = getAvailableActions({ status: 'ready_for_pickup', _id: 'req_abc' }, perms);
      expect(actions.map((a) => a.id)).toEqual(['print', 'release']);

      const printAct = actions.find((a) => a.id === 'print');
      expect(printAct.kind).toBe('link');
      expect(printAct.href).toBe('/staff/requests/req_abc/print');

      const releaseAct = actions.find((a) => a.id === 'release');
      expect(releaseAct.kind).toBe('transition');
      expect(releaseAct.nextStatus).toBe('released');
    });

    it('released status: allows print and archive', () => {
      const perms = {
        [STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS]: true,
        [STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS]: true,
      };
      const actions = getAvailableActions({ status: 'released', _id: 'req_xyz' }, perms);
      expect(actions.map((a) => a.id)).toEqual(['print', 'archive']);
    });

    it('cancelled status: allows archive when can_archive_records is granted', () => {
      const perms = { [STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS]: true };
      const actions = getAvailableActions({ status: 'cancelled' }, perms);
      expect(actions.map((a) => a.id)).toEqual(['archive']);
    });

    it('archived status: terminal state, returns empty array regardless of permissions', () => {
      const allPerms = {};
      allPermissions.forEach((p) => { allPerms[p] = true; });
      expect(getAvailableActions({ status: 'archived' }, allPerms, ROLES.ADMIN)).toEqual([]);
      expect(getAvailableActions({ status: 'archived' }, allPerms, ROLES.STAFF)).toEqual([]);
    });
  });
});
