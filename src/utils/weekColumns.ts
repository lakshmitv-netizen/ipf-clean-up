// Week columns for the FY26 planning grid.
// Mirrors the deployed Commercial Planning grid (Parag build): 52 weekly columns
// derived from the monthly values, with compact headers + tooltips handled by the grid.

const MONTH_KEYS = [
  'jan2026', 'feb2026', 'mar2026', 'apr2026', 'may2026', 'jun2026',
  'jul2026', 'aug2026', 'sep2026', 'oct2026', 'nov2026', 'dec2026',
] as const;

// Weeks attributed to each month for value distribution. Sums to 52.
const WEEKS_PER_MONTH = [5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEK_COUNT = 52;
// FY26 starts Jan 1, 2026. Weeks are contiguous 7-day blocks from this date.
const FIRST_WEEK_START = new Date(2026, 0, 1);

export function weekKey(n: number): `week${number}_2026` {
  return `week${n}_2026`;
}

/** Start/end calendar dates for week N (1-based). */
export function weekRange(n: number): { start: Date; end: Date } {
  const start = new Date(FIRST_WEEK_START);
  start.setDate(FIRST_WEEK_START.getDate() + 7 * (n - 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export interface WeekHeader {
  key: `week${number}_2026`;
  granularity: 'week';
  label: string;
  shortLabel: string;
}

/** 52 week headers: full label "Week N (Mon D - Mon D)" + compact "WN(D/M/YY)". */
export function buildWeekHeaders(): WeekHeader[] {
  const out: WeekHeader[] = [];
  for (let n = 1; n <= WEEK_COUNT; n++) {
    const { start, end } = weekRange(n);
    const label = `Week ${n} (${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} - ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()})`;
    const shortLabel = `W${n}(${start.getDate()}/${start.getMonth() + 1}/${String(start.getFullYear()).slice(-2)})`;
    out.push({ key: weekKey(n), granularity: 'week', label, shortLabel });
  }
  return out;
}

/**
 * Derive week values from monthly values, mutating `values` in place.
 * No-op if week values are already present (so user edits to week cells persist).
 */
export function deriveWeekValues(values: Record<string, number>): void {
  if (values[weekKey(1)] !== undefined) return;
  let w = 1;
  for (let i = 0; i < 12; i++) {
    const monthVal = values[MONTH_KEYS[i]] ?? 0;
    const cnt = WEEKS_PER_MONTH[i];
    const per = cnt > 0 ? monthVal / cnt : 0;
    for (let k = 0; k < cnt && w <= WEEK_COUNT; k++) {
      values[weekKey(w)] = Math.round(per);
      w++;
    }
  }
}

/** Inclusive overlap test: does week N intersect [start, end] (local calendar dates)? */
export function weekOverlapsRange(n: number, start: Date | null, end: Date | null): boolean {
  const { start: ws, end: we } = weekRange(n);
  if (start && we < start) return false;
  if (end && ws > end) return false;
  return true;
}
