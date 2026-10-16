import { describe, expect, it } from 'vitest';
import { safeNextPath } from './auth-navigation';

const origin = 'https://santorio.example';
describe('post-login destination', () => {
  it('preserves a local OAuth consent return path and query', () => {
    expect(safeNextPath('/oauth/consent?request_id=123', origin)).toBe('/oauth/consent?request_id=123');
    expect(safeNextPath('/workout#history', origin)).toBe('/workout#history');
  });
  it('rejects external URLs, protocol-relative URLs, backslashes and control characters', () => {
    for (const input of ['https://evil.example', '//evil.example/path', '/\\evil.example', '/\nevil.example', 'javascript:alert(1)', null]) expect(safeNextPath(input, origin)).toBeNull();
  });
  it('does not redirect back into login or reset-password loops, including normalized paths', () => {
    for (const input of ['/login?next=/login', '/reset-password', '/workout/../login']) expect(safeNextPath(input, origin)).toBeNull();
  });
});
