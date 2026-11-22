export interface EnvEntry {
  key: string;
  value: string;
  line: number;
}
export interface ParseIssue {
  line: number;
  kind: 'malformed' | 'bad-key' | 'duplicate' | 'unclosed-quote';
  key?: string;
  message: string;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses .env text. Values are returned for checking only — callers must never render them. */
export function parseEnv(text: string): { entries: EnvEntry[]; issues: ParseIssue[] } {
  const entries: EnvEntry[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Map<string, number>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let s = raw.trim();
    if (!s || s.startsWith('#')) return;
    if (s.startsWith('export ')) s = s.slice(7).trim();
    const eq = s.indexOf('=');
    if (eq <= 0) {
      issues.push({ line, kind: 'malformed', message: 'Expected KEY=value.' });
      return;
    }
    const key = s.slice(0, eq).trim();
    let value = s.slice(eq + 1).trim();
    if (!KEY_RE.test(key)) {
      issues.push({ line, kind: 'bad-key', key, message: 'Keys may only use letters, digits and _, and cannot start with a digit.' });
      return;
    }
    const q = value[0];
    if (q === '"' || q === "'") {
      const end = value.indexOf(q, 1);
      if (end === -1) {
        issues.push({ line, kind: 'unclosed-quote', key, message: `The value starts with ${q} but never closes it.` });
        return;
      }
      value = value.slice(1, end);
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (seen.has(key)) {
      issues.push({ line, kind: 'duplicate', key, message: `Also defined on line ${seen.get(key)}. The later value wins.` });
      const idx = entries.findIndex((e) => e.key === key);
      entries.splice(idx, 1);
    }
    seen.set(key, line);
    entries.push({ key, value, line });
  });
  return { entries, issues };
}

export type VarType = 'string' | 'number' | 'int' | 'port' | 'boolean' | 'url' | 'email' | 'enum';
export interface SchemaRule {
  key: string;
  type: VarType;
  optional: boolean;
  options?: string[];
  secret: boolean;
  description?: string;
  line: number;
}

/**
 * Schema lines: `KEY type`, `KEY? type` (optional), `KEY enum:a,b,c`, `KEY string secret`, with `# description`.
 * A plain .env.example (KEY=placeholder) is also accepted: every key becomes a required string.
 */
export function parseSchema(text: string): { rules: SchemaRule[]; errors: { line: number; message: string }[] } {
  const rules: SchemaRule[] = [];
  const errors: { line: number; message: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const [body, ...desc] = raw.split('#');
    const s = body.trim();
    if (!s) return;
    if (s.includes('=')) {
      const key = s.split('=')[0].replace(/^export\s+/, '').trim();
      if (KEY_RE.test(key)) rules.push({ key, type: 'string', optional: false, secret: /SECRET|TOKEN|PASSWORD|PRIVATE|_KEY$/.test(key), line, description: desc.join('#').trim() || undefined });
      else errors.push({ line, message: `“${key}” is not a valid key name.` });
      return;
    }
    const parts = s.split(/\s+/);
    let key = parts[0];
    const optional = key.endsWith('?');
    if (optional) key = key.slice(0, -1);
    if (!KEY_RE.test(key)) return errors.push({ line, message: `“${parts[0]}” is not a valid key name.` });
    const typeTok = parts[1] ?? 'string';
    let type: VarType;
    let options: string[] | undefined;
    if (typeTok.startsWith('enum:')) {
      type = 'enum';
      options = typeTok.slice(5).split(',').map((x) => x.trim()).filter(Boolean);
      if (options.length === 0) return errors.push({ line, message: 'enum: needs at least one option, e.g. enum:dev,prod.' });
    } else if (['string', 'number', 'int', 'port', 'boolean', 'url', 'email'].includes(typeTok)) type = typeTok as VarType;
    else return errors.push({ line, message: `Unknown type “${typeTok}”. Use string, number, int, port, boolean, url, email or enum:a,b.` });
    if (rules.some((r) => r.key === key)) return errors.push({ line, message: `${key} is listed twice in the schema.` });
    rules.push({ key, type, optional, options, secret: parts.includes('secret') || /SECRET|TOKEN|PASSWORD|PRIVATE/.test(key), description: desc.join('#').trim() || undefined, line });
  });
  return { rules, errors };
}

export function checkType(rule: SchemaRule, value: string): string | null {
  switch (rule.type) {
    case 'number':
      return value !== '' && Number.isFinite(Number(value)) ? null : 'Should be a number.';
    case 'int':
      return /^-?\d+$/.test(value) ? null : 'Should be a whole number.';
    case 'port': {
      const n = Number(value);
      return /^\d+$/.test(value) && n >= 1 && n <= 65535 ? null : 'Should be a port from 1 to 65535.';
    }
    case 'boolean':
      return /^(true|false|1|0|yes|no)$/i.test(value) ? null : 'Should be true/false, 1/0 or yes/no.';
    case 'url':
      try {
        const u = new URL(value);
        return u.protocol && u.host ? null : 'Should be a full URL.';
      } catch {
        return 'Should be a full URL, e.g. https://api.example.com or postgres://host:5432/db.';
      }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Should be an email address.';
    case 'enum':
      return rule.options!.includes(value) ? null : `Should be one of: ${rule.options!.join(', ')}.`;
    default:
      return null;
  }
}

/** Shannon entropy in bits per character — a rough signal for real-looking secrets. */
export function entropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function looksLikeRealSecret(value: string): boolean {
  if (value.length < 20) return false;
  if (/example|placeholder|changeme|demo|test|xxx|your[-_]?/i.test(value)) return false;
  return entropy(value) > 3.6;
}

export type Status = 'ok' | 'missing' | 'empty' | 'invalid' | 'extra' | 'optional-missing';
export interface Finding {
  key: string;
  status: Status;
  detail: string;
  length: number | null;
  rule?: SchemaRule;
  secretWarning?: boolean;
  line?: number;
}

export function validate(entries: EnvEntry[], rules: SchemaRule[]): Finding[] {
  const map = new Map(entries.map((e) => [e.key, e]));
  const out: Finding[] = [];
  for (const r of rules) {
    const e = map.get(r.key);
    if (!e) {
      out.push({ key: r.key, status: r.optional ? 'optional-missing' : 'missing', detail: r.optional ? 'Optional — not set.' : 'Required but not set.', length: null, rule: r });
      continue;
    }
    if (e.value === '') {
      out.push({ key: r.key, status: r.optional ? 'optional-missing' : 'empty', detail: r.optional ? 'Optional — set but empty.' : 'Set, but the value is empty.', length: 0, rule: r, line: e.line });
      continue;
    }
    const typeErr = checkType(r, e.value);
    out.push({ key: r.key, status: typeErr ? 'invalid' : 'ok', detail: typeErr ?? `Valid ${r.type}${r.type === 'enum' ? '' : ''}.`, length: e.value.length, rule: r, line: e.line, secretWarning: r.secret && looksLikeRealSecret(e.value) });
  }
  for (const e of entries) if (!rules.some((r) => r.key === e.key)) out.push({ key: e.key, status: 'extra', detail: 'Not in the schema — remove it or add it to the schema.', length: e.value.length, line: e.line, secretWarning: /SECRET|TOKEN|PASSWORD|PRIVATE|_KEY$/.test(e.key) && looksLikeRealSecret(e.value) });
  return out;
}

export function mask(length: number | null): string {
  if (length == null) return '—';
  if (length === 0) return '(empty)';
  return `${'•'.repeat(Math.min(8, length))} ${length} char${length === 1 ? '' : 's'}`;
}

export function report(findings: Finding[], issues: ParseIssue[]): string {
  const lines = ['# EnvGuard report', '', 'Values are not included in this report.', '', '| Key | Status | Detail |', '| --- | --- | --- |'];
  for (const f of findings) lines.push(`| ${f.key} | ${f.status} | ${f.detail}${f.secretWarning ? ' Looks like a real secret.' : ''} |`);
  if (issues.length) {
    lines.push('', '## Line problems', '');
    for (const i of issues) lines.push(`- Line ${i.line}${i.key ? ` (${i.key})` : ''}: ${i.message}`);
  }
  return lines.join('\n') + '\n';
}
