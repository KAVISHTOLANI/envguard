import { describe, expect, it } from 'vitest';
import { checkType, entropy, looksLikeRealSecret, mask, parseEnv, parseSchema, report, validate } from './env';

describe('parseEnv', () => {
  it('handles comments, export, quotes and inline comments', () => {
    const { entries, issues } = parseEnv('# comment\nexport A=1\nB="two words # not a comment"\nC=three # trailing\nD=\n');
    expect(issues).toEqual([]);
    expect(entries.map((e) => [e.key, e.value])).toEqual([['A', '1'], ['B', 'two words # not a comment'], ['C', 'three'], ['D', '']]);
  });
  it('reports malformed lines, bad keys, unclosed quotes and duplicates', () => {
    const { entries, issues } = parseEnv('JUSTTEXT\nmy-key=1\nQ="open\nA=1\nA=2');
    expect(issues.map((i) => i.kind)).toEqual(['malformed', 'bad-key', 'unclosed-quote', 'duplicate']);
    expect(entries).toEqual([{ key: 'A', value: '2', line: 5 }]);
  });
});

describe('parseSchema', () => {
  it('reads typed rules, optional keys, enums and descriptions', () => {
    const { rules, errors } = parseSchema('PORT port # http port\nNODE_ENV enum:development,production\nSENTRY_DSN? url\nAPI_TOKEN string secret');
    expect(errors).toEqual([]);
    expect(rules.map((r) => [r.key, r.type, r.optional, r.secret])).toEqual([['PORT', 'port', false, false], ['NODE_ENV', 'enum', false, false], ['SENTRY_DSN', 'url', true, false], ['API_TOKEN', 'string', false, true]]);
    expect(rules[0].description).toBe('http port');
  });
  it('accepts a .env.example and reports schema errors', () => {
    expect(parseSchema('DATABASE_URL=postgres://localhost/db\nSECRET_KEY=change-me').rules.map((r) => [r.key, r.secret])).toEqual([['DATABASE_URL', false], ['SECRET_KEY', true]]);
    expect(parseSchema('X colour\n1BAD string\nE enum:\nA int\nA int').errors).toHaveLength(4);
  });
});

describe('validation', () => {
  it('checks types', () => {
    const r = (type: string, options?: string[]) => ({ key: 'K', type, optional: false, secret: false, line: 1, options }) as never;
    expect(checkType(r('port'), '8080')).toBeNull();
    expect(checkType(r('port'), '70000')).toMatch(/port/);
    expect(checkType(r('boolean'), 'Yes')).toBeNull();
    expect(checkType(r('url'), 'postgres://u@h:5432/db')).toBeNull();
    expect(checkType(r('url'), 'localhost')).toMatch(/full URL/);
    expect(checkType(r('enum', ['a', 'b']), 'c')).toMatch(/one of/);
    expect(checkType(r('int'), '1.5')).toMatch(/whole/);
  });
  it('finds missing, empty, invalid, optional and extra keys', () => {
    const { rules } = parseSchema('A port\nB url\nC? string\nD string\nE string');
    const { entries } = parseEnv('A=99999\nB=https://x.example\nE=\nZ=1');
    const f = validate(entries, rules);
    expect(f.map((x) => [x.key, x.status])).toEqual([['A', 'invalid'], ['B', 'ok'], ['C', 'optional-missing'], ['D', 'missing'], ['E', 'empty'], ['Z', 'extra']]);
  });
  it('flags real-looking secrets but not placeholders, and never reveals values', () => {
    expect(entropy('aaaa')).toBe(0);
    expect(looksLikeRealSecret('demo-not-a-real-secret-123456')).toBe(false);
    expect(looksLikeRealSecret('q8Zr2LmV9xKpT4wBn7YcH1sJ6dFg')).toBe(true);
    expect(mask(24)).toBe('•••••••• 24 chars');
    expect(mask(0)).toBe('(empty)');
    const r = report(validate(parseEnv('API_TOKEN=hunter2hunter2').entries, parseSchema('API_TOKEN string secret').rules), []);
    expect(r).not.toContain('hunter2');
  });
});
