import { describe, expect, it } from 'vitest';
import { endAfter, zonedClock, zonedInstant } from './time';

describe('workout clock times in the profile time zone', () => {
  it('round-trips a Pacific evening time, including across DST', () => {
    expect(zonedInstant('2026-10-16', '18:30', 'America/Los_Angeles')).toBe('2026-10-17T01:30:00.000Z');
    expect(zonedInstant('2026-12-16', '18:30', 'America/Los_Angeles')).toBe('2026-12-17T02:30:00.000Z');
    expect(zonedClock('2026-10-17T01:30:00.000Z', 'America/Los_Angeles')).toBe('18:30');
  });

  it('treats an end before the start as past midnight', () => {
    const start = zonedInstant('2026-10-16', '23:30', 'America/Los_Angeles');
    const end = endAfter(start, zonedInstant('2026-10-16', '00:40', 'America/Los_Angeles'));
    expect(Date.parse(end) - Date.parse(start)).toBe(70 * 60000);
  });
});
