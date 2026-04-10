import { addDays, format, getDay, getYear, startOfDay, subDays } from "date-fns";

/** Inclusive range of years preloaded into {@link HOLIDAY_SET}. */
const HOLIDAY_YEAR_MIN = 2024;
const HOLIDAY_YEAR_MAX = 2030;

/** Gregorian Easter Sunday (Anonymous algorithm). */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return startOfDay(new Date(year, month - 1, day));
}

function buildYearHolidays(year: number): Date[] {
  const easter = getEasterSunday(year);
  const goodFriday = subDays(easter, 2);
  const carnivalTuesday = subDays(easter, 47);
  const corpusChristi = addDays(easter, 60);

  return [
    startOfDay(new Date(year, 0, 1)),
    carnivalTuesday,
    goodFriday,
    easter,
    startOfDay(new Date(year, 3, 25)),
    startOfDay(new Date(year, 4, 1)),
    corpusChristi,
    startOfDay(new Date(year, 5, 10)),
    startOfDay(new Date(year, 7, 15)),
    startOfDay(new Date(year, 9, 5)),
    startOfDay(new Date(year, 10, 1)),
    startOfDay(new Date(year, 11, 1)),
    startOfDay(new Date(year, 11, 8)),
    startOfDay(new Date(year, 11, 25)),
  ];
}

function formatDateKey(date: Date): string {
  return format(startOfDay(date), "yyyy-MM-dd");
}

/** All holiday date keys for {@link HOLIDAY_YEAR_MIN}–{@link HOLIDAY_YEAR_MAX}. */
const HOLIDAY_SET = new Set<string>();

for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
  for (const d of buildYearHolidays(year)) {
    HOLIDAY_SET.add(formatDateKey(d));
  }
}

/** Keys per year for dates outside the preloaded range (built on first use). */
const holidayKeysByYear = new Map<number, Set<string>>();

/** Portuguese public holidays (fixed + moveable), 2024–2030. */
export const PORTUGUESE_PUBLIC_HOLIDAYS: readonly Date[] = (() => {
  const out: Date[] = [];
  for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
    out.push(...buildYearHolidays(year));
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
})();

export function isHoliday(date: Date): boolean {
  const d = startOfDay(date);
  const key = formatDateKey(d);
  const y = getYear(d);
  if (y >= HOLIDAY_YEAR_MIN && y <= HOLIDAY_YEAR_MAX) {
    return HOLIDAY_SET.has(key);
  }
  let keys = holidayKeysByYear.get(y);
  if (!keys) {
    keys = new Set(buildYearHolidays(y).map((h) => formatDateKey(h)));
    holidayKeysByYear.set(y, keys);
  }
  return keys.has(key);
}

export function isWeekend(date: Date): boolean {
  const d = getDay(date);
  return d === 0 || d === 6;
}

export function isWorkingDay(date: Date): boolean {
  const d = startOfDay(date);
  return !isWeekend(d) && !isHoliday(d);
}

/**
 * Adds working days starting from `date` (local calendar day), counting only
 * days where {@link isWorkingDay} is true. Non-working start days are skipped
 * until counting begins on the first working day.
 */
export function addWorkingDays(date: Date, days: number): Date {
  if (days <= 0) {
    return startOfDay(date);
  }
  let current = startOfDay(date);
  let remaining = days;
  while (remaining > 0) {
    if (isWorkingDay(current)) {
      remaining--;
      if (remaining === 0) {
        return current;
      }
    }
    current = addDays(current, 1);
  }
  return current;
}

/** Next calendar day after `date` that is a working day. */
export function getNextWorkingDay(date: Date): Date {
  let d = addDays(startOfDay(date), 1);
  while (!isWorkingDay(d)) {
    d = addDays(d, 1);
  }
  return d;
}

/**
 * Day 0 is the request day if the time is on or before 10:00; otherwise day 0
 * is the next working day. Returns that anchor plus `workingDays` working days.
 */
export function calculateDeadline(requestedAt: Date, workingDays: number): Date {
  const dayStart = startOfDay(requestedAt);
  const minutesFromMidnight =
    requestedAt.getHours() * 60 + requestedAt.getMinutes();
  const onOrBefore10 = minutesFromMidnight <= 10 * 60;
  const anchor = onOrBefore10 ? dayStart : getNextWorkingDay(dayStart);
  return addWorkingDays(anchor, workingDays);
}

const WINDOW_MWF = "18:00 – 19:00";
const WINDOW_TU_TH = "17:00 – 17:30";

/** Delivery window by weekday (Mon/Wed/Fri vs Tue/Thu; weekend uses Mon/Wed/Fri window). */
export function getExpectedDeliveryWindow(deliveryDate: Date): string {
  const dow = getDay(deliveryDate);
  if (dow === 2 || dow === 4) {
    return WINDOW_TU_TH;
  }
  return WINDOW_MWF;
}

/** True when adding `requiredHours` to current `usedHours` does not exceed `maxHours`. */
export function isCapacityAvailable(
  usedHours: number,
  maxHours: number,
  requiredHours: number
): boolean {
  return usedHours + requiredHours <= maxHours;
}
