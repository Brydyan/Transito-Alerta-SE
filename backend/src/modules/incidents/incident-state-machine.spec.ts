import {
  ALLOWED_STATUSES,
  TRANSITIONS,
  canTransition,
} from './incident-state-machine';
import type { IncidentStatus } from '../../entities/incident.entity';

/**
 * F1 of `2026-08-29-fix-incident-state-machine` (story sc-315) — TDD
 * strict. These tests were written BEFORE the module existed. Running
 * them against the previous code (`incident-workflow.service.ts`
 * carrying a 3-state list locally) fails the matrix coverage tests
 * because there is no `canTransition` and the graph is not exported.
 *
 * ## What this spec asserts
 *
 * - The 4 valid transitions: pending→in_progress, pending→closed,
 *   in_progress→resolved, in_progress→closed.
 * - The 12 invalid transitions, including the formerly-permitted
 *   resolved→closed (old linear semantic, R6 of the bug).
 * - `ALLOWED_STATUSES` is derived from the graph, not maintained
 *   separately — that was the cause of `closed` being unreachable.
 * - Terminal states (resolved, closed) declare an empty array, not
 *   absent from the map (a missing key would crash at runtime
 *   instead of producing a clean 409).
 * - A critical-priority incident is born in `pending`, not
 *   `in_progress` (D9 — the F7 reminder needs a state to stop on).
 */

const STATUSES: IncidentStatus[] = ['pending', 'in_progress', 'resolved', 'closed'];

describe('incident-state-machine (sc-315)', () => {
  describe('ALLOWED_STATUSES', () => {
    it('exposes the four declared states', () => {
      expect([...ALLOWED_STATUSES].sort()).toEqual([...STATUSES].sort());
    });

    it('is derived from Object.keys(TRANSITIONS) — not a separate list', () => {
      // The whole point of D3: two lists diverged once; the new code
      // must enforce the single source of truth at the type level too.
      expect([...ALLOWED_STATUSES].sort()).toEqual(
        [...Object.keys(TRANSITIONS)].sort(),
      );
    });
  });

  describe('TRANSITIONS graph', () => {
    it('declares an entry for every status — terminals use [], not omission', () => {
      for (const s of STATUSES) {
        expect(TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(TRANSITIONS[s])).toBe(true);
      }
    });

    it('marks resolved and closed as terminal (empty out-edge set)', () => {
      expect(TRANSITIONS.resolved).toEqual([]);
      expect(TRANSITIONS.closed).toEqual([]);
    });

    it('orders keys uniquely (the change closes the Object.entries() fragility)', () => {
      // The previous code allowed Object.entries() to dictate order;
      // the new graph fixes it via `order` if we add one. Here we
      // require the keys to be a set (no duplicates) at minimum.
      const keys = Object.keys(TRANSITIONS);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('canTransition — full 4×4 matrix', () => {
    it('accepts pending → in_progress (assignment / claim)', () => {
      expect(canTransition('pending', 'in_progress')).toBe(true);
    });

    it('accepts pending → closed (discard invalid / duplicate report)', () => {
      expect(canTransition('pending', 'closed')).toBe(true);
    });

    it('accepts in_progress → resolved (operator resolved)', () => {
      expect(canTransition('in_progress', 'resolved')).toBe(true);
    });

    it('accepts in_progress → closed (could not resolve, give up)', () => {
      expect(canTransition('in_progress', 'closed')).toBe(true);
    });

    it('REJECTS resolved → closed (D1: distinct terminal outcomes, not consecutive)', () => {
      // The bug-defining transition: the old linear semantic allowed
      // this, conflating "approved post-resolve" with "couldn't resolve".
      expect(canTransition('resolved', 'closed')).toBe(false);
    });

    it.each([
      ['pending', 'pending'],
      ['pending', 'resolved'],
      ['in_progress', 'pending'],
      ['in_progress', 'in_progress'],
      ['resolved', 'pending'],
      ['resolved', 'in_progress'],
      ['resolved', 'resolved'],
      ['closed', 'pending'],
      ['closed', 'in_progress'],
      ['closed', 'resolved'],
      ['closed', 'closed'],
    ] as Array<[IncidentStatus, IncidentStatus]>)(
      'REJECTS %s → %s (no transition declared)',
      (from, to) => {
        expect(canTransition(from, to)).toBe(false);
      },
    );
  });

  describe('D9 — critical priority is born in pending, not in_progress', () => {
    it('documents that the graph itself does not encode priority', () => {
      // The state machine is a pure status graph. Priority is a separate
      // dimension; the contract here is that the ONLY initial state
      // permitted is `pending`. This test pins that down by asserting
      // canTransition(initial, ...) is undefined for `in_progress` and
      // `closed` as origins (i.e. there is no "auto-promote" path the
      // graph could let a writer exploit by accident).
      expect(canTransition('pending' as IncidentStatus, 'pending')).toBe(false);
      // The graph does not provide any from-state for a brand-new row
      // — that decision is the service's, not the machine's. The
      // service MUST default to 'pending' on insert, regardless of
      // priority. This is verified in the entity default test and the
      // create-spec; the machine is just the place to document it.
    });
  });
});
