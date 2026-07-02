/**
 * midcine Health Monitor — borrowed from mostqlworkwatssap/monitoring/monitor.js
 *
 * Probes:
 *   1. apps/web        (http://localhost:3000/)
 *   2. mcp-bridge      (http://localhost:8210/health) + backend_reachable
 *   3. Orthanc         (http://localhost:8042/system) — optional
 *   4. Tailscale funnel port (:8445)  — optional public probe
 *
 * Output:
 *   - logs/monitor-YYYY-MM-DD.jsonl
 *   - logs/monitor-alerts.jsonl (only when alerts fire)
 *   - stdout summary (Arabic)
 *
 * Usage:
 *   node scripts/monitor.js                       # single probe
 *   node scripts/monitor.js --watch               # loop every 60s
 *   node scripts/monitor.js --watch --interval=30 # loop every 30s
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const WEB_URL = process.env.MIDCINE_WEB_URL || 'http://localhost:3000';
const BRIDGE_URL = process.env.MIDCINE_BRIDGE_URL || 'http://localhost:8210';
const ORTHANC_URL = process.env.MIDCINE_ORTHANC_URL || 'http://localhost:8042';
const PUBLIC_URL = process.env.MIDCINE_PUBLIC_URL || 'https://ame.tail19ddab.ts.net:8445';
const INTERVAL = parseInt(process.env.MIDCINE_INTERVAL_SEC || '60', 10) * 1000;
const LOG_DIR = process.env.MIDCINE_LOG_DIR || path.join(__dirname, '..', 'logs');
const ALERT_LAT = parseInt(process.env.MIDCINE_ALERT_LATENCY_MS || '1500', 10);
const SKIP_ORTHANC = process.env.MIDCINE_SKIP_ORTHANC === '1';
const SKIP_PUBLIC = process.env.MIDCINE_SKIP_PUBLIC === '1';

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function probe(url, { timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return resolve({ ok: false, error: 'bad_url', latencyMs: 0 });
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(url, { timeout, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c.toString().slice(0, 4096)));
      res.on('end', () =>
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          latencyMs: Date.now() - start,
          body: data.slice(0, 1024),
        }),
      );
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message, latencyMs: Date.now() - start }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout', latencyMs: timeout });
    });
  });
}

async function fullCheck() {
  const ts = new Date().toISOString();
  const [web, bridge, orthanc, pub] = await Promise.all([
    probe(WEB_URL + '/'),
    probe(BRIDGE_URL + '/health'),
    SKIP_ORTHANC ? Promise.resolve(null) : probe(ORTHANC_URL + '/system'),
    SKIP_PUBLIC ? Promise.resolve(null) : probe(PUBLIC_URL + '/'),
  ]);

  let bridgeBackend = null;
  if (bridge.ok && bridge.body) {
    try {
      const j = JSON.parse(bridge.body);
      bridgeBackend = {
        backend: j.backend,
        backend_reachable: j.backend_reachable,
        status: j.status,
      };
    } catch {}
  }

  const alerts = [];
  if (!web.ok)
    alerts.push({ level: 'critical', area: 'web', msg: `web فشل (${web.status || web.error})` });
  if (!bridge.ok)
    alerts.push({
      level: 'critical',
      area: 'bridge',
      msg: `bridge فشل (${bridge.status || bridge.error})`,
    });
  if (bridgeBackend && bridgeBackend.backend_reachable === false)
    alerts.push({
      level: 'warn',
      area: 'naraya',
      msg: `backend غير متاح: ${bridgeBackend.backend}`,
    });
  if (web.ok && web.latencyMs > ALERT_LAT)
    alerts.push({ level: 'warn', area: 'latency-web', msg: `web بطيء ${web.latencyMs}ms` });
  if (bridge.ok && bridge.latencyMs > ALERT_LAT)
    alerts.push({
      level: 'warn',
      area: 'latency-bridge',
      msg: `bridge بطيء ${bridge.latencyMs}ms`,
    });
  if (orthanc && !orthanc.ok)
    alerts.push({
      level: 'warn',
      area: 'orthanc',
      msg: `Orthanc غير متاح (${orthanc.status || orthanc.error})`,
    });
  if (pub && !pub.ok)
    alerts.push({
      level: 'warn',
      area: 'public',
      msg: `funnel غير متاح (${pub.status || pub.error})`,
    });

  const record = {
    ts,
    web,
    bridge,
    bridgeBackend,
    orthanc,
    pub,
    alerts,
    summary: alerts.length === 0 ? '✅ صحي' : `⚠️ ${alerts.length} تنبيه`,
  };

  const day = ts.slice(0, 10);
  fs.appendFileSync(path.join(LOG_DIR, `monitor-${day}.jsonl`), JSON.stringify(record) + '\n');
  if (alerts.length > 0) {
    fs.appendFileSync(
      path.join(LOG_DIR, 'monitor-alerts.jsonl'),
      JSON.stringify({ ts, alerts }) + '\n',
    );
  }
  return record;
}

function printSummary(r) {
  const t = new Date(r.ts).toLocaleString('ar-EG', { hour12: false });
  const icon =
    r.alerts.length === 0 ? '✅' : r.alerts.some((a) => a.level === 'critical') ? '🔴' : '🟡';
  console.log(`\n${icon} ${t} ${r.summary}`);
  console.log('─'.repeat(60));
  console.log(`  web        : ${r.web.ok ? '✓' : '✗'} ${r.web.latencyMs}ms  (${WEB_URL})`);
  const bb = r.bridgeBackend;
  const bbStr = bb ? ` [${bb.backend} reachable=${bb.backend_reachable}]` : '';
  console.log(`  mcp-bridge : ${r.bridge.ok ? '✓' : '✗'} ${r.bridge.latencyMs}ms${bbStr}`);
  if (r.orthanc) console.log(`  orthanc    : ${r.orthanc.ok ? '✓' : '✗'} ${r.orthanc.latencyMs}ms`);
  if (r.pub)
    console.log(`  public     : ${r.pub.ok ? '✓' : '✗'} ${r.pub.latencyMs}ms  (${PUBLIC_URL})`);
  for (const a of r.alerts) {
    const c = a.level === 'critical' ? '🔴' : '🟡';
    console.log(`  ${c} [${a.area}] ${a.msg}`);
  }
}

(async () => {
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const intervalArg = args.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) * 1000 : INTERVAL;

  console.log(`🔍 midcine monitor — web=${WEB_URL} bridge=${BRIDGE_URL} log=${LOG_DIR}`);
  if (watch) console.log(`   watching every ${intervalMs / 1000}s — Ctrl+C to stop`);

  async function tick() {
    try {
      const r = await fullCheck();
      printSummary(r);
    } catch (e) {
      console.error('❌ monitor crash:', e.message);
    }
  }

  await tick();
  if (watch) {
    setInterval(tick, intervalMs);
    process.on('SIGINT', () => {
      console.log('\n👋 monitor stopped');
      process.exit(0);
    });
  }
})();
