// server.js — meta-bot-backend (Instagram/WhatsApp gateway -> n8n)

import "dotenv/config";
import express from "express";

// Node 18+ fetch var. Node 16 olarsa fallback:
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  try {
    const undici = await import("undici");
    fetchFn = undici.fetch;
  } catch {
    // heç nə — aşağıda error verəcəyik
  }
}

const app = express();

// Meta adətən JSON göndərir
app.use(express.json({ limit: "2mb" }));

// === ENV ===
const PORT = Number(process.env.PORT || "8080") || 8080;
const VERIFY_TOKEN = String(process.env.VERIFY_TOKEN || "neox_verify_token").trim();
const N8N_WEBHOOK_URL = String(process.env.N8N_WEBHOOK_URL || "").trim();

// === Helpers ===
function safeStr(x) {
  return typeof x === "string" ? x : "";
}

function pickFirstTextEvent(body) {
  // Facebook Messenger/IG classic format: entry[].messaging[]
  // Instagram Graph / WhatsApp Cloud format: entry[].changes[]
  // Biz hamısını yoxlayırıq.

  const items = [];

  if (Array.isArray(body?.entry)) {
    for (const entry of body.entry) {
      // 1) messaging
      if (Array.isArray(entry?.messaging)) {
        for (const m of entry.messaging) items.push(m);
      }
      // 2) changes
      if (Array.isArray(entry?.changes)) {
        for (const c of entry.changes) items.push(c);
      }
    }
  }

  // A) messaging event
  for (const ev of items) {
    const text = safeStr(ev?.message?.text);
    if (text) {
      return {
        channel: "meta.messaging",
        userId: safeStr(ev?.sender?.id),
        text,
        timestamp: ev?.timestamp || Date.now(),
        raw: ev,
      };
    }
  }

  // B) changes event (WhatsApp/IG graph)
  for (const ev of items) {
    const value = ev?.value;

    // WhatsApp Cloud: value.messages[0].text.body
    const waText = safeStr(value?.messages?.[0]?.text?.body);
    if (waText) {
      return {
        channel: "whatsapp",
        userId: safeStr(value?.contacts?.[0]?.wa_id) || safeStr(value?.messages?.[0]?.from),
        text: waText,
        timestamp: value?.messages?.[0]?.timestamp ? Number(value.messages[0].timestamp) * 1000 : Date.now(),
        raw: ev,
      };
    }

    // IG comments/messages can vary; for now only capture generic "message"
    const igText =
      safeStr(value?.message) ||
      safeStr(value?.text) ||
      safeStr(value?.messages?.[0]?.message) ||
      safeStr(value?.messages?.[0]?.text);
    if (igText) {
      return {
        channel: "instagram",
        userId: safeStr(value?.from?.id) || safeStr(value?.sender?.id) || safeStr(value?.user_id),
        text: igText,
        timestamp: Date.now(),
        raw: ev,
      };
    }
  }

  return null;
}

async function forwardToN8n(payload) {
  if (!N8N_WEBHOOK_URL) {
    console.warn("[meta-bot] N8N_WEBHOOK_URL missing");
    return { ok: false, error: "N8N_WEBHOOK_URL missing" };
  }
  if (!fetchFn) {
    console.warn("[meta-bot] fetch not available (use Node 18+ or add undici)");
    return { ok: false, error: "fetch not available" };
  }

  const r = await fetchFn(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await r.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // n8n bəzən plain text qaytara bilər
  }

  return { ok: r.ok, status: r.status, text, json };
}

// === Routes ===

// Health
app.get("/", (req, res) => {
  res.status(200).send("Backend is working");
});

// Meta verify
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[meta-bot] Webhook verified");
    return res.status(200).send(String(challenge || ""));
  }
  return res.sendStatus(403);
});

// Meta events
app.post("/webhook", async (req, res) => {
  // Meta retry etməsin deyə ASAP 200 veririk.
  res.sendStatus(200);

  try {
    const body = req.body;

    const ev = pickFirstTextEvent(body);
    if (!ev?.text) return;

    const payload = {
      source: "meta",
      channel: ev.channel,
      userId: ev.userId,
      text: ev.text,
      timestamp: ev.timestamp,
      // istəsən raw-u da göndərə bilərik (indi göndərmirəm, payload böyüməsin)
    };

    const out = await forwardToN8n(payload);

    console.log("[meta-bot] forwarded to n8n:", {
      ok: out.ok,
      status: out.status,
      preview: (out.json ?? out.text ?? "").toString().slice(0, 120),
    });

    // Növbəti addımda: out.json.replyText varsa, Graph API ilə IG/WA-ya cavab göndərəcəyik.
  } catch (err) {
    console.error("[meta-bot] Error:", err);
  }
});

app.listen(PORT, () => {
  console.log("[meta-bot] listening on", PORT);
  console.log("[meta-bot] VERIFY_TOKEN:", VERIFY_TOKEN ? "ON" : "OFF");
  console.log("[meta-bot] N8N_WEBHOOK_URL:", N8N_WEBHOOK_URL ? "ON" : "OFF");
});