#!/usr/bin/env node
// monitor.mjs — synthetische Funktions-Checks für Leadesk (Phase 1a).
// Off-box in GitHub Actions. Prüft ECHTE Prod-Endpunkte + verifiziert das Ergebnis.
// Mailt bei Zustandswechsel grün→rot via Postmark. Node 20+ (native fetch), keine Deps.

import { readFileSync, writeFileSync } from 'node:fs'

const env = process.env
const BASE = env.MON_SUPABASE_URL
const ANON = env.MON_ANON_KEY
const APP_URL = env.APP_URL || 'https://app.leadesk.de'
const ADMIN_URL = env.ADMIN_URL || 'https://admin.leadesk.de'
const STATE_FILE = env.STATE_FILE || './state.json'
const RENOTIFY_MIN = Number(env.RENOTIFY_MIN || 60)
const RUN_IMAGE = new Date().getMinutes() < 10   // generate-image nur 1×/h
const TIMEOUT_MS = 25000

async function timed(fn) {
  const t0 = Date.now()
  try { const v = await fn(); return { ok: true, ms: Date.now() - t0, ...v } }
  catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e?.message || e) } }
}
function fetchT(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT_MS) })
}
function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47]
  if (![...sig].every((b, i) => buf[i] === b)) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

async function login() {
  const r = await fetchT(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.MON_USER_EMAIL, password: env.MON_USER_PASSWORD }),
  })
  if (!r.ok) throw new Error(`auth ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  if (!j.access_token) throw new Error('kein access_token')
  return j.access_token
}

function authedHeaders(jwt) {
  return { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' }
}
async function checkHealth(name, url, headers = {}) {
  return timed(async () => {
    const r = await fetchT(url, { headers })
    if (!r.ok) throw new Error(`${name} HTTP ${r.status}`)
    return {}
  })
}
async function checkGenerateText(jwt) {
  return timed(async () => {
    const r = await fetchT(`${BASE}/functions/v1/generate`, {
      method: 'POST', headers: authedHeaders(jwt),
      body: JSON.stringify({ type: 'freitext', prompt: 'Monitoring-Ping: antworte mit einem kurzen Satz.' }),
    })
    if (!r.ok) throw new Error(`generate HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`)
    const j = await r.json()
    if (!j.text || j.text.trim().length < 3) throw new Error('leerer/zu kurzer Text')
    return {}
  })
}
async function checkGenerateImage(jwt) {
  return timed(async () => {
    const tW = 1200, tH = 627
    const r = await fetchT(`${BASE}/functions/v1/generate-image`, {
      method: 'POST', headers: authedHeaders(jwt),
      body: JSON.stringify({
        prompt: 'Monitoring: schlichter blauer Verlauf, keine Schrift.',
        aspectRatio: '16:9', variants: 1,
        model: 'gemini-2.5-flash-image', quality: 'medium',
        targetWidth: tW, targetHeight: tH,
      }),
    })
    if (!r.ok) throw new Error(`generate-image HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`)
    const j = await r.json()
    const v = j?.visuals?.[0]
    if (!v?.storage_path) throw new Error('kein visual zurück')
    const sr = await fetchT(`${BASE}/storage/v1/object/sign/visuals/${v.storage_path}`, {
      method: 'POST', headers: authedHeaders(jwt), body: JSON.stringify({ expiresIn: 120 }),
    })
    const sj = await sr.json()
    const img = await fetchT(`${BASE}/storage/v1${sj.signedURL}`)
    const buf = Buffer.from(await img.arrayBuffer())
    const size = pngSize(buf)
    if (!size) throw new Error('Bild nicht als PNG lesbar')
    if (size.w !== tW || size.h !== tH) throw new Error(`Crop falsch: ${size.w}×${size.h} statt ${tW}×${tH} (imagescript-Fallback?)`)
    return { detail: `${size.w}×${size.h}` }
  })
}
async function cleanup(jwt) {
  if (!env.MON_TEAM_ID) return
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  try {
    await fetchT(`${BASE}/rest/v1/visuals?team_id=eq.${env.MON_TEAM_ID}&created_at=lt.${cutoff}`, {
      method: 'DELETE', headers: { ...authedHeaders(jwt), Prefer: 'return=minimal' },
    })
  } catch {}
}

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)) }

async function sendMail(subject, body) {
  if (!env.POSTMARK_TOKEN) { console.log('(keine POSTMARK_TOKEN — Mail übersprungen)'); return }
  const r = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': env.POSTMARK_TOKEN },
    body: JSON.stringify({ From: env.MON_FROM, To: env.ALERT_TO, Subject: subject, TextBody: body, MessageStream: 'outbound' }),
  })
  if (!r.ok) console.error('Postmark-Fehler', r.status, await r.text())
}

const results = []
let jwt = null
const auth = await timed(async () => { jwt = await login(); return {} })
results.push({ name: 'auth-login', ...auth })
results.push({ name: 'app', ...(await checkHealth('app', APP_URL)) })
results.push({ name: 'admin', ...(await checkHealth('admin', ADMIN_URL)) })
results.push({ name: 'gotrue', ...(await checkHealth('gotrue', `${BASE}/auth/v1/health`)) })
results.push({ name: 'rest', ...(await checkHealth('rest', `${BASE}/rest/v1/`, { apikey: ANON })) })
if (jwt) {
  results.push({ name: 'generate-text', ...(await checkGenerateText(jwt)) })
  if (RUN_IMAGE) results.push({ name: 'generate-image', ...(await checkGenerateImage(jwt)) })
  await cleanup(jwt)
}
for (const r of results) console.log(`${r.ok ? '✅' : '🔴'} ${r.name}  ${r.ms}ms  ${r.detail || r.error || ''}`)

const prev = loadState()
const now = Date.now()
const next = {}
const newlyDown = [], recovered = [], stillDown = []
for (const r of results) {
  const p = prev[r.name] || { ok: true, lastAlert: 0 }
  next[r.name] = { ok: r.ok, lastAlert: p.lastAlert || 0, ms: r.ms, error: r.error || null }
  if (!r.ok && p.ok) { newlyDown.push(r); next[r.name].lastAlert = now }
  else if (!r.ok && !p.ok) {
    if (now - (p.lastAlert || 0) > RENOTIFY_MIN * 60000) { stillDown.push(r); next[r.name].lastAlert = now }
    else next[r.name].lastAlert = p.lastAlert
  } else if (r.ok && !p.ok) { recovered.push(r) }
}
saveState(next)

const lines = (arr) => arr.map(r => `• ${r.name}: ${r.error || 'ok'} (${r.ms}ms)`).join('\n')
if (newlyDown.length || stillDown.length) {
  const down = [...newlyDown, ...stillDown]
  await sendMail(
    `[Leadesk Monitor] 🔴 ${down.map(r => r.name).join(', ')} down`,
    `Fehlgeschlagene Checks (${new Date().toISOString()}):\n\n${lines(down)}\n\nRun: ${env.GITHUB_SERVER_URL || ''}/${env.GITHUB_REPOSITORY || ''}/actions/runs/${env.GITHUB_RUN_ID || ''}`
  )
}
if (recovered.length) {
  await sendMail(
    `[Leadesk Monitor] ✅ ${recovered.map(r => r.name).join(', ')} wieder ok`,
    `Wiederhergestellt (${new Date().toISOString()}):\n\n${lines(recovered)}`
  )
}
process.exit(results.every(r => r.ok) ? 0 : 1)
