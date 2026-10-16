/** Wall-clock times in the profile's time zone, stored as UTC instants. */

function offsetMinutes(instant: number, zone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - instant) / 60000;
}

/** "2026-10-16" + "18:30" in America/Los_Angeles → the ISO instant. Settles across DST changes. */
export function zonedInstant(date: string, time: string, zone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let instant = wall - offsetMinutes(wall, zone) * 60000;
  instant = wall - offsetMinutes(instant, zone) * 60000;
  return new Date(instant).toISOString();
}

/** The "HH:MM" an instant shows on a clock in the zone (for <input type="time">). */
export function zonedClock(iso: string, zone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).map(part => [part.type, part.value]));
  return `${String(+parts.hour % 24).padStart(2, '0')}:${parts.minute}`;
}

/** "6:30 PM" */
export function zonedLabel(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** An end time earlier than the start means the workout ran past midnight. */
export function endAfter(start: string | undefined, end: string): string {
  return start && Date.parse(end) < Date.parse(start) ? new Date(Date.parse(end) + 86_400_000).toISOString() : end;
}
