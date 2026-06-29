"use strict";
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const QRCode = require("qrcode");
const http = require("http");
const path = require("path");
const pino = require("pino");

const PORT = process.env.WA_PORT ? parseInt(process.env.WA_PORT) : 3002;
const SESSION_DIR = path.join(__dirname, "session");

let currentQR = null;       // raw QR string from baileys
let status = "disconnected"; // 'disconnected' | 'connecting' | 'connected'
let sock = null;
let isShuttingDown = false;

const logger = pino({ level: "silent" });

async function connectToWhatsApp() {
  if (isShuttingDown) return;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ["PrintLab", "Chrome", "1.0"],
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      status = "connecting";
      console.log("[wa] QR üretildi — admin panelden okutun");
    }

    if (connection === "open") {
      currentQR = null;
      status = "connected";
      console.log("[wa] WhatsApp bağlandı ✓");
    }

    if (connection === "close") {
      currentQR = null;
      status = "disconnected";
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      console.log("[wa] Bağlantı kapandı, sebep:", reason, "yeniden bağlan:", shouldReconnect);
      if (shouldReconnect && !isShuttingDown) {
        setTimeout(() => connectToWhatsApp(), 5_000);
      }
    }
  });
}

// ── HTTP Server ───────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");

  // GET /status
  if (req.method === "GET" && req.url === "/status") {
    res.end(JSON.stringify({ status, hasQr: !!currentQR }));
    return;
  }

  // GET /qr  — returns base64 data URL
  if (req.method === "GET" && req.url === "/qr") {
    if (!currentQR) {
      res.end(JSON.stringify({ qr: null, status }));
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(currentQR, { width: 280, margin: 2 });
      res.end(JSON.stringify({ qr: dataUrl, status }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "QR render hatası: " + err.message }));
    }
    return;
  }

  // POST /send  — { phone: "905XXXXXXXXX", message: "..." }
  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { phone, message } = JSON.parse(body);
        if (!phone || !message) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "phone ve message zorunlu" }));
          return;
        }
        if (status !== "connected" || !sock) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "WhatsApp bağlı değil" }));
          return;
        }
        // Normalise: strip all non-digit chars, append WhatsApp JID suffix
        const digits = phone.replace(/\D/g, "");
        const jid = `${digits}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        console.log("[wa] Mesaj gönderildi →", digits);
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("[wa] send hatası:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // POST /logout
  if (req.method === "POST" && req.url === "/logout") {
    try {
      if (sock) await sock.logout().catch(() => {});
      status = "disconnected";
      currentQR = null;
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => connectToWhatsApp(), 2_000);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[wa] WhatsApp servisi 127.0.0.1:${PORT} üzerinde çalışıyor`);
  connectToWhatsApp();
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
  server.close();
});
