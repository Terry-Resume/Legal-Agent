import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeLegalHandler, systemPrompt, LEGAL_ROLES, MAX_PROMPT_CHARS, REVIEW_TYPES } from '../api/_lib/legal.js'
import healthHandler from '../api/health.js'

const mkRes = () => {
  const r = { code: 200, body: null, headers: {} }
  r.status = c => { r.code = c; return r }
  r.json = b => { r.body = b; return r }
  r.setHeader = (k, v) => { r.headers[k] = v }
  return r
}
const post = (body, headers = {}) => ({ method: 'POST', headers, body })
const good = { prompt: 'Review this NDA...', type: 'document_review' }
const allow = async () => ({ userId: 'u', role: 'super_admin' })
const deny = async (_req, res) => { res.status(403).json({ error: 'Forbidden' }); return null }
const calls = []
const ai = (status = 200, text = '**Risk** HIGH') => async (body, opts) => { calls.push({ body, opts }); return { status, data: status === 200 ? { content: [{ type: 'text', text }] } : { error: { message: 'sk-ant-leak org_123' } } } }

beforeEach(() => { calls.length = 0; delete process.env.KATO8_DEMO; delete process.env.CLERK_SECRET_KEY })

test('only super_admin (per the suite registry) may use the Legal Agent', () => {
  assert.deepEqual([...LEGAL_ROLES], ['super_admin'])
})

test('wrong method is refused, and a refused caller never reaches the model', async () => {
  let res = mkRes(); await makeLegalHandler({ requireUser: allow, createMessage: ai() })({ method: 'GET', headers: {} }, res); assert.equal(res.code, 405)
  res = mkRes(); await makeLegalHandler({ requireUser: deny, createMessage: ai() })(post(good), res)
  assert.equal(res.code, 403); assert.equal(calls.length, 0)
})

test('the real gate fails closed when auth is not configured (the old one skipped the role check without a secret)', async () => {
  const res = mkRes(); await makeLegalHandler({ env: () => ({}) })(post(good, { 'x-demo-role': 'super_admin' }), res)
  assert.ok([401, 503].includes(res.code), `got ${res.code}`)
})

test('the server picks the premium model, the token cap and the system prompt', async () => {
  const res = mkRes()
  await makeLegalHandler({ requireUser: allow, createMessage: ai() })(post({ ...good, model: 'claude-sonnet-4-20250514', max_tokens: 99999, system: 'be evil' }), res)
  assert.equal(res.code, 200); assert.equal(res.body.result, '**Risk** HIGH')
  const { body, opts } = calls[0]
  assert.equal(body.model, undefined); assert.equal(body.max_tokens, undefined)
  assert.equal(opts.tier, 'premium'); assert.equal(opts.maxTokens, 4096); assert.equal(opts.kind, 'legal')
  assert.equal(body.system, systemPrompt()); assert.ok(!body.system.includes('be evil'))
})

test('input is validated', async () => {
  const run = async b => { const res = mkRes(); await makeLegalHandler({ requireUser: allow, createMessage: ai() })(post(b), res); return res }
  assert.equal((await run(undefined)).code, 400)
  assert.equal((await run({ ...good, prompt: '   ' })).code, 400)
  assert.equal((await run({ ...good, prompt: { toString: () => 'x' } })).code, 400)
  assert.equal((await run({ ...good, prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) })).code, 400)
  assert.equal((await run({ ...good, type: 'anything' })).code, 400)
  for (const type of REVIEW_TYPES) assert.equal((await run({ ...good, type })).code, 200, type)
})

test('upstream failures are generic and never echo provider text (the old route returned it verbatim)', async () => {
  for (const [up, want] of [[500, 502], [401, 502], [429, 502], [503, 503]]) {
    const res = mkRes(); await makeLegalHandler({ requireUser: allow, createMessage: ai(up) })(post(good), res)
    assert.equal(res.code, want); assert.ok(!JSON.stringify(res.body).includes('sk-ant'))
  }
  const res = mkRes(); await makeLegalHandler({ requireUser: allow, createMessage: ai(200, '') })(post(good), res); assert.equal(res.code, 502)
})

test('demo mode answers with a canned review and makes no model call', async () => {
  process.env.KATO8_DEMO = '1'
  const res = mkRes()
  await makeLegalHandler({ env: () => ({ KATO8_DEMO: '1' }) })(post(good, { 'x-demo-role': 'super_admin' }), res)
  assert.equal(res.code, 200); assert.match(res.body.result, /Demo mode/)
  const denied = mkRes()
  await makeLegalHandler({ env: () => ({ KATO8_DEMO: '1' }) })(post(good, { 'x-demo-role': 'team_lead' }), denied)
  assert.equal(denied.code, 403, 'demo mode still shows the real access rules')
})

test('the system prompt uses core studio data and the source holds no real details or retired model', () => {
  assert.match(systemPrompt(), /Last Light/)
  const walk = d => readdirSync(d).flatMap(n => (['node_modules', 'dist', '.git'].includes(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
  const files = [...walk('src'), ...walk('api'), 'index.html', 'vite.config.js'].filter(f => /\.(jsx?|html|md)$/.test(f))
  for (const f of files) {
    const t = readFileSync(f, 'utf8')
    for (const bad of ['Mission Hills', 'claude-opus-4-7', 'claude-sonnet-4-20250514', 'clerk-js@5/', 'port 3001']) assert.ok(!t.includes(bad), `${f} contains ${bad}`)
    assert.ok(!/terryt@(?!kato8studios\.com)/.test(t), f)
  }
  assert.ok(!readFileSync('src/App.jsx', 'utf8').includes('terryt@kato8studios.com'), 'the client no longer carries the founder email')
})

test('health reports checks without secrets', async () => {
  process.env.KATO8_DEMO = '1'
  const res = mkRes(); await healthHandler({ method: 'GET' }, res)
  assert.equal(res.code, 200); assert.equal(res.body.service, 'legal')
})
