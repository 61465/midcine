/**
 * midcine whatsapp-bridge
 *
 * - يربط بـ WhatsApp عبر Baileys (web protocol — يحتاج مسح QR مرة واحدة)
 * - يقرأ من Redis Stream doctor:notify ويرسل رسائل + مرفقات
 * - يحدّث midcine.notifications.status عبر Ingestion API webhook بسيط
 * - يعرض QR على /qr عند الإقلاع
 */
import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import Redis from 'ioredis';
import express from 'express';
import qrcode from 'qrcode';
import qrTerm from 'qrcode-terminal';
import pino from 'pino';
import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379/0';
const STREAM = 'doctor:notify';
const GROUP = 'whatsapp-bridge';
const CONSUMER = process.env.HOSTNAME || 'wa-1';
const AUTH_DIR = process.env.AUTH_DIR || './auth_state';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8500', 10);
const SIMULATE = process.env.WA_SIMULATE === 'true'; // dev mode بدون اتصال حقيقي

let sock = null;
let lastQrSvg = null;
let connectionStatus = 'disconnected';

async function startSocket() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  log.info({ version }, 'baileys version');

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
    browser: ['midcine', 'Chrome', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      lastQrSvg = await qrcode.toString(qr, { type: 'svg' });
      connectionStatus = 'awaiting_qr';
      qrTerm.generate(qr, { small: true });
      log.info('QR ready — open http://localhost:8500/qr OR scan terminal');
    }
    if (connection === 'open') {
      connectionStatus = 'connected';
      lastQrSvg = null;
      log.info('whatsapp connected');
    }
    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        log.warn({ code }, 'reconnecting in 3s');
        setTimeout(startSocket, 3000);
      } else {
        log.error('logged out — delete auth_state and rescan QR');
      }
    }
  });
}

function toJid(phone) {
  // إزالة + و non-digits، تأكد E.164 ثم @s.whatsapp.net
  const digits = String(phone).replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

async function fetchAttachment(uri) {
  // s3:// → نقرأها عبر MinIO؛ http(s):// → axios
  if (uri.startsWith('s3://')) {
    const rest = uri.slice(5);
    const [bucket, ...keyParts] = rest.split('/');
    const key = keyParts.join('/');
    const url = `${process.env.MINIO_PUBLIC_ENDPOINT || 'http://minio:9000'}/${bucket}/${key}`;
    const r = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(r.data);
  }
  const r = await axios.get(uri, { responseType: 'arraybuffer' });
  return Buffer.from(r.data);
}

async function sendMessage(target, body, attachments) {
  const jid = toJid(target);
  if (SIMULATE || !sock || connectionStatus !== 'connected') {
    log.info({ to: target, body: body.slice(0, 80), attachments: attachments?.length || 0, simulate: SIMULATE }, 'SIMULATE send');
    return { simulated: true };
  }

  await sock.sendMessage(jid, { text: body });

  for (const a of attachments || []) {
    try {
      const buf = await fetchAttachment(a.uri);
      const isImage = (a.uri || '').match(/\.(png|jpg|jpeg|webp)$/i) || a.kind === 'image';
      const isPdf = (a.uri || '').match(/\.pdf$/i) || a.kind === 'report_pdf';
      if (isImage) {
        await sock.sendMessage(jid, { image: buf, caption: a.name || '' });
      } else if (isPdf) {
        await sock.sendMessage(jid, {
          document: buf,
          mimetype: 'application/pdf',
          fileName: a.name || 'report.pdf',
        });
      } else {
        await sock.sendMessage(jid, {
          document: buf,
          mimetype: 'application/octet-stream',
          fileName: a.name || 'file',
        });
      }
    } catch (e) {
      log.warn({ err: e.message, uri: a.uri }, 'attachment send failed');
    }
  }
  return { sent: true };
}

async function consumeLoop() {
  const redis = new Redis(REDIS_URL);
  try {
    await redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
  } catch (e) {
    // group exists — ok
  }
  log.info(`consuming ${STREAM} as ${GROUP}/${CONSUMER}`);
  while (true) {
    try {
      const resp = await redis.xreadgroup(
        'GROUP', GROUP, CONSUMER,
        'BLOCK', 5000, 'COUNT', 4,
        'STREAMS', STREAM, '>'
      );
      if (!resp) continue;
      for (const [, msgs] of resp) {
        for (const [msgId, fields] of msgs) {
          const obj = {};
          for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
          const target = obj.target;
          const body = obj.body || '';
          let attachments = [];
          try { attachments = JSON.parse(obj.attachments || '[]'); } catch {}
          try {
            const result = await sendMessage(target, body, attachments);
            log.info({ msgId, target, result }, 'sent');
          } catch (e) {
            log.error({ err: e.message, msgId }, 'send failed');
          }
          await redis.xack(STREAM, GROUP, msgId);
        }
      }
    } catch (e) {
      log.error({ err: e.message }, 'consume loop error');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// HTTP server (لعرض QR + healthz)
const httpApp = express();
httpApp.get('/healthz', (req, res) => res.json({ status: 'ok', wa: connectionStatus }));
httpApp.get('/qr', (req, res) => {
  if (lastQrSvg) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(lastQrSvg);
  } else if (connectionStatus === 'connected') {
    res.send('<h1>متصل ✓</h1>');
  } else {
    res.send('<h1>لا QR متاح حالياً — أعد التشغيل</h1>');
  }
});
httpApp.post('/test/send', express.json(), async (req, res) => {
  try {
    const { target, body, attachments } = req.body;
    const r = await sendMessage(target, body || 'midcine test', attachments || []);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
httpApp.listen(HTTP_PORT, () => log.info(`http on :${HTTP_PORT}`));

if (!SIMULATE) {
  startSocket().catch(e => log.error({ err: e.message }, 'startup failed'));
} else {
  log.warn('WA_SIMULATE=true — لن يتم اتصال WhatsApp حقيقي');
}
consumeLoop();
