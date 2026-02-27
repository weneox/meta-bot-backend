// src/services/n8nClient.js
import { N8N_TIMEOUT_MS, N8N_WEBHOOK_URL } from "../config.js";

// Node 18+ fetch var. Node 16 olarsa fallback (undici).
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  try {
    const undici = await import("undici");
    fetchFn = undici.fetch;
  } catch {
    // fetch yoxdursa, forwardToN8n error qaytaracaq
  }
}

export async function forwardToN8n(payload) {
  if (!N8N_WEBHOOK_URL) {
    console.warn("[meta-bot] N8N_WEBHOOK_URL missing");
    return { ok: false, error: "N8N_WEBHOOK_URL missing" };
  }
  if (!fetchFn) {
    console.warn("[meta-bot] fetch not available (use Node 18+ or add undici)");
    return { ok: false, error: "fetch not available" };
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), N8N_TIMEOUT_MS);

  try {
    const r = await fetchFn(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    const text = await r.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // n8n plain text qaytara bilər
    }

    return { ok: r.ok, status: r.status, text, json };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}