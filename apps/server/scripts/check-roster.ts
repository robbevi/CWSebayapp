/**
 * Exercises APP_USERS_JSON parsing against the ways a value gets mangled in transit — a
 * dashboard field that swaps in curly quotes, a copy that grabbed the wrapping quotes, a
 * paste that got cut short. An empty roster blanks the user picker for everyone, so the
 * parser has to say why rather than failing quietly.
 *
 * Run with: npx tsx scripts/check-roster.ts
 */
const GOOD = '[{"name":"A Person","role":"warehouse"},{"name":"B Person","role":"lister"}]';
const CURLY = GOOD.replace(/"/g, '“');
const WHITESPACE = '\n  ' + GOOD + '  \n';

const CASES: { label: string; value: string; expect: number }[] = [
  { label: 'clean', value: GOOD, expect: 2 },
  { label: 'curly quotes', value: CURLY, expect: 2 },
  { label: 'wrapped in double quotes', value: '"' + GOOD + '"', expect: 2 },
  { label: "wrapped in single quotes", value: "'" + GOOD + "'", expect: 2 },
  { label: 'surrounding whitespace', value: WHITESPACE, expect: 2 },
  { label: 'truncated', value: GOOD.slice(0, -12), expect: 0 },
  { label: 'unknown role', value: '[{"name":"C Person","role":"manager"}]', expect: 1 },
  { label: 'not an array', value: '{"name":"D Person","role":"lister"}', expect: 0 },
  { label: 'empty string', value: '', expect: 0 },
  // No "unset" case: clearing the variable just makes dotenv reload it from the local
  // .env file, so it cannot be isolated in-process. An empty string covers the same path.
];

let failures = 0;

for (const { label, value, expect } of CASES) {
  process.env.APP_USERS_JSON = value;

  // Cache-busted import so each case re-runs the module's top-level parse.
  const mod = await import('../src/config/env.js?bust=' + Math.random());
  const count = mod.env.appUsers.length;
  const problem = mod.appUsersProblem as string | undefined;
  const ok = count === expect;
  if (!ok) failures++;

  const detail = problem ? '  | ' + problem.slice(0, 76) : '';
  console.log(
    (ok ? 'ok   ' : 'FAIL ') + label.padEnd(26) + '-> ' + count + ' user(s), expected ' + expect + detail
  );
}

console.log(failures === 0 ? '\nAll cases behaved as expected.' : `\n${failures} case(s) misbehaved.`);
process.exit(failures === 0 ? 0 : 1);
