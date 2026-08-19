/**
 * The D11 session-validity predicate (T3.9 design §4), interpolated as a
 * literal SQL fragment into every query site that needs to filter for a
 * live session. Exists exactly once — mirrored, not re-derived, by
 * `UserSessionEntity.isValid(now)`.
 */
export const ACTIVE_SESSION_SQL =
  'revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL';

/**
 * Pure predicate for the benign-retry (grace) path (T3.9 design §7, spec
 * "Reuse Detection"). `rotatedAt === null` means the session has never
 * rotated (e.g. straight off `login()`) — there is no prior generation to
 * forgive, so it always returns `false`.
 *
 * Boundary is inclusive (`<=`), matching the spec's own wording
 * ("`now() - rotated_at <= sessionRefreshGraceSeconds`"). `graceSeconds
 * === 0` therefore reproduces unmitigated reuse detection exactly: no
 * non-negative elapsed time can ever be `<= 0` except elapsed `=== 0`
 * (todo replay in the same instant as the rotation, an edge case that is
 * still, correctly, forgiven — but any real-world replay always measures
 * `> 0`).
 */
export function isWithinRotationGrace(
  rotatedAt: Date | null,
  now: Date,
  graceSeconds: number,
): boolean {
  if (rotatedAt === null) {
    return false;
  }
  const elapsedSeconds = (now.getTime() - rotatedAt.getTime()) / 1000;
  return elapsedSeconds >= 0 && elapsedSeconds <= graceSeconds;
}
