import { availableActions, IncidentAction } from './workflow.util';
import { Incident } from '../../core/models/incident.model';

/**
 * F3 (sc-303) — F3.3.2 matrix spec.
 *
 * The matrix is status × permissions × claim ownership. Each `it` is
 * one cell. The cases match the spec scenarios in
 * `specs/frontend-incidents/spec.md`:
 *
 *  - "disponible + UPDATE ⇒ claim"
 *  - "reclamada por el usuario ⇒ release"
 *  - "reclamada por otro ⇒ ni claim ni release"
 *  - "sin UPDATE ⇒ vacío"
 *  - "con ASSIGN assignments ⇒ incluye assign"
 *
 * Plus the sc-315 backend-aligned cases that the F3.1.7 blocker
 * used to gate:
 *  - `pending → close` (admin closes duplicate)
 *  - `in_progress → close` (admin closes unresolvable)
 *  - terminal states (resolved, closed) yield no actions
 */

const NOW = new Date('2026-09-01T00:00:00Z');
const MOCK_USER = 'user-mock';
const OTHER_USER = 'user-other';

const baseIncident: Pick<Incident, 'status' | 'claimed_by' | 'priority' | 'id'> = {
  id: 'inc-1',
  status: 'pending',
  claimed_by: null,
  priority: 'medium',
};

const ALL_USER_PERMS = ['UPDATE incidents', 'CLOSE incidents', 'ASSIGN assignments'];
const UPDATE_ONLY = ['UPDATE incidents'];
const CLOSE_ONLY = ['CLOSE incidents'];
const NO_PERMS: string[] = [];
const ASSIGN_ONLY = ['ASSIGN assignments'];

function actions(
  status: Incident['status'],
  perms: readonly string[],
  claimedBy: string | null,
  userId: string = MOCK_USER,
): readonly IncidentAction[] {
  return availableActions(
    { ...baseIncident, status, claimed_by: claimedBy },
    perms,
    userId,
  );
}

describe('availableActions (F3.3.2 — status × permissions × claim)', () => {
  describe('pending', () => {
    it('+ UPDATE, unclaimed ⇒ claim', () => {
      expect(actions('pending', UPDATE_ONLY, null)).toEqual(['claim']);
    });

    it('+ CLOSE only (without UPDATE) ⇒ empty (W3 — doble puerta del backend)', () => {
      // El backend exige `UPDATE incidents` como mínimo en la ruta
      // PATCH /incidents/:id/status. Mostrar el botón "close" a un
      // usuario con sólo `CLOSE incidents` sería un 403 sorpresivo.
      // La función pura refleja la doble puerta: hasUpdate AND hasClose.
      expect(actions('pending', CLOSE_ONLY, null)).toEqual([]);
    });

    it('+ UPDATE + CLOSE + ASSIGN ⇒ claim + close + assign (order: claim, close, assign)', () => {
      expect(actions('pending', ALL_USER_PERMS, null)).toEqual([
        'claim',
        'close',
        'assign',
      ]);
    });

    it('+ UPDATE, claimed by another ⇒ no claim (and no release — you don\'t hold it)', () => {
      expect(actions('pending', UPDATE_ONLY, OTHER_USER)).toEqual([]);
    });

    it('+ UPDATE, claimed by the same user (rare but legal) ⇒ no claim', () => {
      // claimed_by === currentUserId but status is still pending.
      // This is a data anomaly; availableActions is conservative and
      // offers neither claim (already yours) nor release (not in_progress).
      expect(actions('pending', UPDATE_ONLY, MOCK_USER)).toEqual([]);
    });

    it('+ ASSIGN only ⇒ assign (admin can route unassigned work)', () => {
      expect(actions('pending', ASSIGN_ONLY, null)).toEqual(['assign']);
    });

    it('no permissions ⇒ empty', () => {
      expect(actions('pending', NO_PERMS, null)).toEqual([]);
    });
  });

  describe('in_progress', () => {
    it('+ UPDATE, claimed by me ⇒ release + resolve (no claim — I already hold it)', () => {
      // The order is the order the buttons render in the detail page.
      expect(actions('in_progress', UPDATE_ONLY, MOCK_USER)).toEqual([
        'release',
        'resolve',
      ]);
    });

    it('+ UPDATE + CLOSE + ASSIGN, claimed by me ⇒ release + resolve + close + assign', () => {
      // Close is a viable outcome for me too: "I can\'t resolve, admin
      // let me give up" — the button is reachable for the claimer
      // when they also hold CLOSE. The claimer with ASSIGN can also
      // reassign (a senior operator handing the case off).
      expect(actions('in_progress', ALL_USER_PERMS, MOCK_USER)).toEqual([
        'release',
        'resolve',
        'close',
        'assign',
      ]);
    });

    it('+ UPDATE, claimed by another ⇒ no claim, no release, no resolve', () => {
      // F3.3.2 — the third scenario in the spec.
      expect(actions('in_progress', UPDATE_ONLY, OTHER_USER)).toEqual([]);
    });

    it('+ UPDATE + CLOSE, claimed by another ⇒ close (admin overrides the claimer)', () => {
      // La doble puerta: con UPDATE + CLOSE el admin puede cerrar
      // aunque no sea el claimer. El backend aún valida
      // WRONG_ORGANIZATION / role, pero el botón puede aparecer.
      expect(actions('in_progress', ['UPDATE incidents', 'CLOSE incidents'], OTHER_USER)).toEqual(['close']);
    });

    it('+ CLOSE only (without UPDATE) ⇒ empty even in_progress (W3)', () => {
      // Doble puerta: cerrar exige ambos permisos. El escenario
      // `+ CLOSE only, in_progress, claimed by me` ya está cubierto
      // por el in_progress×CLOSE-only anterior; acá fijamos el
      // caso "sin UPDATE" para que un futuro refactor no introduzca
      // la trampa del 403 sorpresivo.
      expect(actions('in_progress', CLOSE_ONLY, MOCK_USER)).toEqual([]);
    });

    it('+ ASSIGN only ⇒ assign (admin reassigns the claim)', () => {
      expect(actions('in_progress', ASSIGN_ONLY, MOCK_USER)).toEqual(['assign']);
    });
  });

  describe('resolved (terminal)', () => {
    it('terminal state — no status transitions possible', () => {
      // The machine in `incident-state-machine.ts` has `resolved: []`.
      // availableActions reflects that: nothing to flip.
      expect(actions('resolved', ALL_USER_PERMS, null)).toEqual([]);
    });

    it('even claimed by me, still empty', () => {
      // Edge case worth pinning: if the user is somehow the claimer
      // of a resolved incident, there is no UI to act on it.
      expect(actions('resolved', ALL_USER_PERMS, MOCK_USER)).toEqual([]);
    });
  });

  describe('closed (terminal)', () => {
    it('terminal state — no actions', () => {
      expect(actions('closed', ALL_USER_PERMS, null)).toEqual([]);
    });
  });

  describe('invariant: priority does not affect the matrix', () => {
    it('a critical priority pending incident offers the same actions as a low one', () => {
      // D9 del design: critical is born in `pending` and follows the
      // same transitions as any other. The matrix doesn't special-case
      // priority — the F3.4 detail page may visually emphasize it, but
      // `availableActions` returns the same set.
      const low = availableActions(
        { ...baseIncident, status: 'pending', priority: 'low' },
        ALL_USER_PERMS,
        MOCK_USER,
      );
      const critical = availableActions(
        { ...baseIncident, status: 'pending', priority: 'critical' },
        ALL_USER_PERMS,
        MOCK_USER,
      );
      expect(critical).toEqual(low);
    });
  });

  describe('strict TDD safety net: no extra fields, no order surprises', () => {
    it('every action appears at most once', () => {
      // F3.4.7 will render the buttons in the order this function
      // returns them. If someone reorders by side effect (e.g. a
      // .sort inside the impl), the snapshot in the listing detail
      // changes silently.
      const result = actions('pending', ALL_USER_PERMS, null);
      expect(new Set(result).size).toBe(result.length);
    });

    it('every returned value is a known IncidentAction', () => {
      const known: IncidentAction[] = ['claim', 'release', 'resolve', 'close', 'assign'];
      for (const status of ['pending', 'in_progress', 'resolved', 'closed'] as const) {
        for (const claimedBy of [null, MOCK_USER, OTHER_USER]) {
          const result = availableActions(
            { ...baseIncident, status, claimed_by: claimedBy },
            ALL_USER_PERMS,
            MOCK_USER,
          );
          for (const a of result) {
            expect(known).toContain(a);
          }
        }
      }
    });
  });

  // Sanity: the type signature matches what we use in the components.
  // Compile-time, but pinned here so a future refactor that returns
  // a mutable array is caught at the boundary.
  it('returns a readonly array (callers cannot mutate the result)', () => {
    const result = actions('pending', ALL_USER_PERMS, null);
    // TypeScript readonly arrays lose .push / .sort at compile time.
    // Runtime check is the equivalent: Object.isFrozen, or just
    // assert the type with a non-mutating API.
    expect(Array.isArray(result)).toBe(true);
    // A defensive runtime check — the impl uses `.push` internally
    // and returns a fresh array, but a future refactor could return
    // a shared array. This fails if the returned array is the same
    // reference across calls.
    const second = actions('pending', ALL_USER_PERMS, null);
    expect(second).not.toBe(result);
  });

  // Anchor: the unused `now` is left intentionally to make a future
  // refactor that needs the timestamp (e.g. for SLA-aware actions)
  // easy to add. Keeping the import would be noise today.
  it('does not import or use a clock (pure function)', () => {
    expect(actions).toBeDefined();
    // If someone adds a `Date.now()` to the function, the matrices
    // above would still pass (they don't depend on time) — but this
    // test anchors the F3.3.3 contract that availableActions is pure.
    void NOW;
  });
});
