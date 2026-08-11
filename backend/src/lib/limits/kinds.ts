/**
 * How a stored ComplianceLimit's `limit_kind` interacts with its `limit_value`.
 *
 * `ComplianceLimit.limit_value` is a non-null Float, but two of the four kinds
 * a real register publishes carry no number:
 *
 *   NOT_REQUIRED  "No MRL Required" — Annex IV exempt (acetic acid, putrescine,
 *                 biological control agents). No MRL applies, so any measured
 *                 level is lawful. 133 of ~647 GB rows per commodity.
 *   PROHIBITED    banned outright; any detection fails.
 *
 * Omitting the NOT_REQUIRED rows is not an option: an absent limit falls through
 * to the regime default (0.01 mg/kg), which turns an exempt substance into a
 * false FAIL. So they are stored with a sentinel that is correct under a naive
 * `measured <= limit_value` comparison, and the kind carries the real meaning
 * for anything that renders or explains the result.
 */

export type LimitKind = 'VALUE' | 'AT_LOD' | 'NOT_REQUIRED' | 'PROHIBITED';

/**
 * Stored `limit_value` for an exempt substance. Physically unreachable
 * (10^9 mg/kg = 1000 kg of residue per kg of product), so every real measurement
 * compares as compliant — which is the legally correct answer for Annex IV.
 * Never displayed: callers render via `describeLimit`.
 */
export const NOT_REQUIRED_SENTINEL = 1_000_000_000;

/** Stored `limit_value` for a prohibited substance: any detection is over it. */
export const PROHIBITED_SENTINEL = 0;

/** The number to store for a parsed limit, given its kind. */
export function storedLimitValue(kind: LimitKind, value: number | null): number {
  switch (kind) {
    case 'VALUE':
    case 'AT_LOD':
      if (value === null) throw new Error(`${kind} limit requires a numeric value`);
      return value;
    case 'NOT_REQUIRED':
      return NOT_REQUIRED_SENTINEL;
    case 'PROHIBITED':
      return PROHIBITED_SENTINEL;
  }
}

/** True when `limit_value` is a sentinel rather than a published number. */
export function isSentinelLimit(kind: string | null | undefined): boolean {
  return kind === 'NOT_REQUIRED' || kind === 'PROHIBITED';
}

/** Human-readable limit for UI and reports. Never prints a sentinel. */
export function describeLimit(kind: string | null | undefined, value: number, unit: string): string {
  if (kind === 'NOT_REQUIRED') return 'No MRL required';
  if (kind === 'PROHIBITED') return 'Prohibited — must not be detected';
  if (kind === 'AT_LOD') return `${value} ${unit} (at LOD)`;
  return `${value} ${unit}`;
}
