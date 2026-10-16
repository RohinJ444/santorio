import {describe,expect,it} from 'vitest';
import {normalizedTimezone,pastDateError} from './settings';

describe('settings draft validation',()=>{
  it('keeps partial and impossible dates out of saved measurements',()=>{
    expect(pastDateError('2026-10','2026-10-16')).not.toBeNull();
    expect(pastDateError('2026-02-30','2026-10-16')).not.toBeNull();
    expect(pastDateError('2024-02-29','2026-10-16')).toBeNull();
  });
  it('rejects future dates without requiring optional birthdays',()=>{
    expect(pastDateError('2026-10-17','2026-10-16')).not.toBeNull();
    expect(pastDateError('2026-10-16','2026-10-16')).toBeNull();
    expect(pastDateError('','2026-10-16',true)).toBeNull();
    expect(pastDateError('','2026-10-16')).not.toBeNull();
  });
  it('validates the current timezone draft and trims pasted whitespace',()=>{
    expect(normalizedTimezone(' America/Los_Angeles ')).toBe('America/Los_Angeles');
    expect(normalizedTimezone('bad/zone')).toBeNull();
    expect(normalizedTimezone('')).toBeNull();
  });
});
