import { describe, expect, it } from 'vitest';
import { cleanUrlVar } from './env.js';

describe('cleanUrlVar', () => {
  const url = 'https://example.com/invoke?api-version=1&sig=abc%2Fdef';

  it('keeps a plain URL as it is', () => {
    expect(cleanUrlVar(url)).toBe(url);
    expect(cleanUrlVar(`  ${url}\n`)).toBe(url);
  });

  it('forgives the whole .env line pasted as the value', () => {
    expect(cleanUrlVar(`SPARE_RESEARCH_URL="${url}"`)).toBe(url);
    expect(cleanUrlVar(`SPARE_RESEARCH_URL = ${url}`)).toBe(url);
  });

  it('drops surrounding quotes', () => {
    expect(cleanUrlVar(`"${url}"`)).toBe(url);
    expect(cleanUrlVar(`'${url}'`)).toBe(url);
  });

  it('treats blank as unset', () => {
    expect(cleanUrlVar(undefined)).toBeUndefined();
    expect(cleanUrlVar('  ')).toBeUndefined();
    expect(cleanUrlVar('""')).toBeUndefined();
  });
});
