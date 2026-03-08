import {
  META_PAGE_ACCESS_TOKEN,
  META_API_VERSION,
  META_REPLY_TIMEOUT_MS,
} from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

async function safeReadJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function postToMeta(body) {
  const token = s(META_PAGE_ACCESS_TOKEN);
  if (!token) {
    return { ok: false, status: 0, error: "META_PAGE_ACCESS_TOKEN missing" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_REPLY_TIMEOUT_MS);

  try {
    const version = s(META_API_VERSION || "v23.0") || "v23.0";
    const url = `https://graph.facebook.com/${version}/me/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await safeReadJson(res);

    return {
      ok: res.ok,
      status: res.status,
      json,
      error: res.ok
        ? null
        : json?.error?.message || json?.message || "Meta request failed",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err?.name === "AbortError" ? "Meta timeout" : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendInstagramTextMessage({ recipientId, text }) {
  const to = s(recipientId);
  const bodyText = s(text);

  if (!to) return { ok: false, status: 0, error: "recipientId missing" };
  if (!bodyText) return { ok: false, status: 0, error: "text missing" };

  return postToMeta({
    recipient: { id: to },
    messaging_type: "RESPONSE",
    message: { text: bodyText },
  });
}

export async function sendInstagramSeen({ recipientId }) {
  const to = s(recipientId);
  if (!to) return { ok: false, status: 0, error: "recipientId missing" };

  return postToMeta({
    recipient: { id: to },
    sender_action: "mark_seen",
  });
}

export async function sendInstagramTypingOn({ recipientId }) {
  const to = s(recipientId);
  if (!to) return { ok: false, status: 0, error: "recipientId missing" };

  return postToMeta({
    recipient: { id: to },
    sender_action: "typing_on",
  });
}

export async function sendInstagramTypingOff({ recipientId }) {
  const to = s(recipientId);
  if (!to) return { ok: false, status: 0, error: "recipientId missing" };

  return postToMeta({
    recipient: { id: to },
    sender_action: "typing_off",
  });
}