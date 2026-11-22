import { useMemo, useState } from 'react';
import { copyText, DemoTag, downloadText, EmptyState, Landing, NotFound, Notice, PageHead, readFileText, Shell, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DEMO_ENV, DEMO_SCHEMA } from './lib/demo';
import { mask, parseEnv, parseSchema, report, validate, type Finding, type Status } from './lib/env';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/check', label: 'Check' },
  { to: '/schema', label: 'Schema syntax' },
];

export default function App() {
  const [route] = useRoute();
  let page;
  if (route === '/') page = <Home />;
  else if (route === '/check') page = <Check />;
  else if (route === '/schema') page = <SchemaHelp />;
  else page = <NotFound />;
  return (
    <Shell name="EnvGuard" wordmark={['Env', 'Guard']} nav={NAV} route={route} cta={{ to: '/check', label: 'Check a file' }} footerNote=".env contents are never saved, uploaded or displayed.">
      {page}
    </Shell>
  );
}

const STATUS: Record<Status, { label: string; cls: string; rank: number }> = {
  missing: { label: 'Missing', cls: 'badge-err', rank: 0 },
  invalid: { label: 'Invalid', cls: 'badge-err', rank: 1 },
  empty: { label: 'Empty', cls: 'badge-warn', rank: 2 },
  extra: { label: 'Extra', cls: 'badge-warn', rank: 3 },
  'optional-missing': { label: 'Optional', cls: '', rank: 4 },
  ok: { label: 'OK', cls: 'badge-ok', rank: 5 },
};

function Home() {
  const f = validate(parseEnv(DEMO_ENV).entries, parseSchema(DEMO_SCHEMA).rules);
  const bad = f.filter((x) => ['missing', 'invalid', 'empty'].includes(x.status)).length;
  return (
    <Landing
      compact
      eyebrow="Environment variable checker"
      title={<>Catch config mistakes <em>before they reach production.</em></>}
      lead="Paste a .env file and the keys your app expects. EnvGuard lists what’s missing, extra or malformed — and checks types like URLs, ports and booleans — without ever showing, saving or sending a single value."
      primary={{ href: '#/check', label: 'Check a .env file' }}
      secondary={{ href: '#/schema', label: 'Schema syntax' }}
      previewLabel="Demo service · values masked"
      meta={['Values never shown', 'Nothing stored or sent', 'Demo files included']}
      preview={
        <div className="hero-env">
          <div className="he-summary">
            <span className="shield" aria-hidden="true">⛨</span>
            <div><strong>{bad} problems</strong> in {f.length} keys<div className="hint">Report contains key names only</div></div>
          </div>
          <table className="table compact">
            <tbody>
              {f.slice(0, 6).map((x) => (
                <tr key={x.key}><td><code>{x.key}</code></td><td className="mono small muted">{mask(x.length)}</td><td><span className={`badge ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      steps={[
        { title: 'Paste your .env', body: 'It is checked in memory and hidden while you type. Nothing is written to storage.' },
        { title: 'Describe what’s required', body: 'One line per key with a type, or paste your .env.example as-is.' },
        { title: 'Fix what’s flagged', body: 'Missing, empty, invalid and extra keys, plus line-level syntax problems.' },
      ]}
      features={[
        { title: 'Values stay hidden', body: 'Results show masked length only — e.g. “•••••••• 24 chars”. Copyable reports contain key names only.' },
        { title: 'Type checks', body: 'url, port, boolean, int, number, email and enum:a,b,c, with optional keys marked by “?”.' },
        { title: 'Syntax problems', body: 'Malformed lines, invalid key names, unclosed quotes and duplicate keys with line numbers.' },
        { title: 'Real-secret warning', body: 'High-randomness values in secret keys are flagged so example files don’t leak real credentials.' },
      ]}
      note="EnvGuard is not a secret store or vault. It deliberately keeps no copy of your .env — only the schema text is remembered in this browser. For anything sensitive, prefer pasting a sanitised example file."
      closing={{ title: <>Validate your <em>config now.</em></>, action: { href: '#/check', label: 'Check a .env file' } }}
    />
  );
}

function Check() {
  // The .env text lives in memory only (never usePersistentState).
  const [envText, setEnvText] = useState(DEMO_ENV);
  const [schemaText, setSchemaText] = usePersistentState('envguard:schema', DEMO_SCHEMA);
  const [hidden, setHidden] = useState(true);
  const [filter, setFilter] = useState<'problems' | 'all'>('problems');
  const [flash, setFlash] = useFlash(5000);
  const env = useMemo(() => parseEnv(envText), [envText]);
  const schema = useMemo(() => parseSchema(schemaText), [schemaText]);
  const findings = useMemo(() => validate(env.entries, schema.rules).sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || a.key.localeCompare(b.key)), [env, schema]);
  const count = (s: Status) => findings.filter((f) => f.status === s).length;
  const problems = count('missing') + count('invalid') + count('empty');
  const shown = filter === 'all' ? findings : findings.filter((f) => f.status !== 'ok' && f.status !== 'optional-missing');
  const isDemo = envText === DEMO_ENV;

  async function loadFile(f: File | undefined, which: 'env' | 'schema') {
    if (!f) return;
    if (f.size > 200_000) return setFlash({ kind: 'error', text: `${f.name} is larger than 200 KB — that doesn’t look like an env file.` });
    const t = await readFileText(f);
    if (which === 'env') setEnvText(t);
    else setSchemaText(t);
    setFlash({ kind: 'success', text: `Loaded ${f.name}.${which === 'env' ? ' Its values are not stored.' : ''}` });
  }

  return (
    <div className="stack">
      <PageHead
        eyebrow={<>Workspace · Check {isDemo && <DemoTag />}</>}
        title={<>Environment <em>check</em></>}
        description={envText.trim() && schema.rules.length ? `${problems === 0 ? 'No blocking problems' : `${problems} blocking problem${problems === 1 ? '' : 's'}`} · ${count('extra')} extra · ${env.issues.length} line issue${env.issues.length === 1 ? '' : 's'}` : 'Paste a .env file and a schema to begin.'}
        actions={
          <>
            <button type="button" className="btn" onClick={() => { setEnvText(DEMO_ENV); setSchemaText(DEMO_SCHEMA); }}>Load demo files</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEnvText('')}>Clear .env</button>
          </>
        }
      />
      <div className="privacy">
        <span aria-hidden="true">⛨</span>
        <p><strong>Your .env stays in this tab.</strong> It is not saved to storage, not sent anywhere, and values are never displayed in results. Reloading the page forgets it.</p>
      </div>
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className="inputs">
        <section className="card stack" aria-label=".env input">
          <div className="card-title-row">
            <label htmlFor="env" className="label-mono">.env file</label>
            <span className="row">
              <label className="check small"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hide values while typing</label>
              <input type="file" id="env-file" className="sr-only" accept=".env,.txt,text/plain" onChange={(e) => loadFile(e.target.files?.[0], 'env')} />
              <label htmlFor="env-file" className="btn btn-sm">Open file</label>
            </span>
          </div>
          <textarea id="env" className={`code ${hidden ? 'masked' : ''}`} rows={12} value={envText} onChange={(e) => setEnvText(e.target.value)} spellCheck={false} autoComplete="off" placeholder={'DATABASE_URL=postgres://…\nPORT=3000'} />
          <span className="hint">{env.entries.length} keys parsed · not stored</span>
        </section>
        <section className="card stack" aria-label="Schema input">
          <div className="card-title-row">
            <label htmlFor="schema" className="label-mono">Required keys (schema)</label>
            <span className="row">
              <input type="file" id="schema-file" className="sr-only" accept=".env,.example,.txt,text/plain" onChange={(e) => loadFile(e.target.files?.[0], 'schema')} />
              <label htmlFor="schema-file" className="btn btn-sm">Open .env.example</label>
            </span>
          </div>
          <textarea id="schema" className="code" rows={12} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} aria-invalid={schema.errors.length ? true : undefined} aria-describedby="schema-hint" />
          <span className="hint" id="schema-hint">{schema.rules.length} rules · remembered in this browser · <a href="#/schema">syntax</a></span>
          {schema.errors.length > 0 && (
            <ul className="error-list" role="alert">
              {schema.errors.map((e) => <li key={e.line}>Schema line {e.line}: {e.message}</li>)}
            </ul>
          )}
        </section>
      </div>

      {!envText.trim() ? (
        <EmptyState title="Paste a .env file to check it" actions={<button type="button" className="btn btn-primary" onClick={() => setEnvText(DEMO_ENV)}>Use the demo .env</button>}>Values are checked in memory and never shown.</EmptyState>
      ) : schema.rules.length === 0 ? (
        <EmptyState title="Add a schema">List the keys your app needs, one per line — or paste your .env.example.</EmptyState>
      ) : (
        <section className="card" aria-labelledby="res-title">
          <div className="card-title-row">
            <h2 id="res-title">Results</h2>
            <div className="row">
              <div className="seg" role="radiogroup" aria-label="Show">
                <button type="button" role="radio" aria-checked={filter === 'problems'} onClick={() => setFilter('problems')}>Problems</button>
                <button type="button" role="radio" aria-checked={filter === 'all'} onClick={() => setFilter('all')}>All keys</button>
              </div>
              <button type="button" className="btn btn-sm" onClick={async () => setFlash((await copyText(report(findings, env.issues))) ? { kind: 'success', text: 'Report copied — it contains key names and statuses only.' } : { kind: 'error', text: 'Clipboard access was blocked.' })}>Copy safe report</button>
              <button type="button" className="btn btn-sm" onClick={() => downloadText('envguard-report.md', report(findings, env.issues), 'text/markdown')}>Download</button>
            </div>
          </div>
          <div className="stats">
            <div className="stat"><div className="stat-label">Missing</div><div className="stat-value bad" data-testid="missing">{count('missing')}</div></div>
            <div className="stat"><div className="stat-label">Invalid</div><div className="stat-value bad" data-testid="invalid">{count('invalid')}</div></div>
            <div className="stat"><div className="stat-label">Empty</div><div className="stat-value warn">{count('empty')}</div></div>
            <div className="stat"><div className="stat-label">Extra</div><div className="stat-value warn" data-testid="extra">{count('extra')}</div></div>
            <div className="stat"><div className="stat-label">OK</div><div className="stat-value good">{count('ok')}</div></div>
          </div>
          {problems === 0 && count('extra') === 0 && env.issues.length === 0 && <Notice kind="success">Everything the schema requires is present and valid.</Notice>}
          {shown.length === 0 ? <p className="muted">No problems to show.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Key</th><th>Status</th><th>Expected</th><th>Value</th><th>Detail</th></tr></thead>
                <tbody>
                  {shown.map((f: Finding) => (
                    <tr key={f.key}>
                      <td><code>{f.key}</code>{f.rule?.secret && <span className="badge secret">secret</span>}</td>
                      <td><span className={`badge ${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span></td>
                      <td className="small">{f.rule ? <>{f.rule.type === 'enum' ? `one of ${f.rule.options!.join(' / ')}` : f.rule.type}{f.rule.optional ? ' · optional' : ''}</> : <span className="muted">not in schema</span>}</td>
                      <td className="mono small muted" aria-label={f.length == null ? 'not set' : `hidden value, ${f.length} characters`}>{mask(f.length)}</td>
                      <td className="small">
                        {f.detail}
                        {f.secretWarning && <div className="secret-warn">This looks like a real secret. Use a placeholder in shared or example files.</div>}
                        {f.rule?.description && <div className="hint">{f.rule.description}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {env.issues.length > 0 && (
            <div className="issues">
              <h3>Line problems in the .env</h3>
              <ul className="list small">
                {env.issues.map((i) => (
                  <li key={i.line}><span className="badge badge-warn">Line {i.line}</span> {i.key && <code>{i.key}</code>} {i.message}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SchemaHelp() {
  return (
    <div className="stack narrow">
      <PageHead eyebrow="Reference" title={<>Schema <em>syntax</em></>} description="One key per line. Anything after # is a description." />
      <div className="card prose">
        <pre className="output">{`NODE_ENV enum:development,production
PORT port                # 1–65535
DATABASE_URL url         # any scheme with a host, e.g. postgres://
REDIS_URL? url           # ? = optional
API_TOKEN string secret  # mark secrets explicitly
ENABLE_SIGNUPS boolean   # true/false, 1/0, yes/no
MAX_ITEMS int
RATIO number
SUPPORT_EMAIL email`}</pre>
        <h2>Types</h2>
        <ul>
          <li><code>string</code> (default) — anything, including empty for optional keys.</li>
          <li><code>number</code>, <code>int</code>, <code>port</code>, <code>boolean</code>, <code>url</code>, <code>email</code>.</li>
          <li><code>enum:a,b,c</code> — exactly one of the listed values (case-sensitive).</li>
        </ul>
        <h2>Using a .env.example instead</h2>
        <p>Lines containing <code>=</code> are read as keys only; each becomes a required <code>string</code>. Keys whose names contain SECRET, TOKEN, PASSWORD, PRIVATE or end in _KEY are treated as secrets.</p>
        <h2>How .env lines are read</h2>
        <p><code>export</code> prefixes are allowed, quotes are removed, <code># comments</code> after unquoted values are ignored, and if a key appears twice the later value wins (and is reported).</p>
      </div>
    </div>
  );
}
