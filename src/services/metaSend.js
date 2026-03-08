import {
  META_PAGE_ACCESS_TOKEN,
  META_API_VERSION,
  META_REPLY_TIMEOUT_MS,
} from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return s(v).toLowerCase();
}

function fail(error, status = 0, json = null) {
  return {
    ok: false,
    status: Number(status || 0),
    error: s(error || "unknown error"),
    json,
  };
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

function metaEndpoint() {
  const version = s(META_API_VERSION || "v23.0") || "v23.0";
  return `https://graph.facebook.com/${version}/me/messages`;
}

async function postToMeta(body) {
  const token = s(META_PAGE_ACCESS_TOKEN);
  if (!token) {
    return fail("META_PAGE_ACCESS_TOKEN missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_REPLY_TIMEOUT_MS);

  try {
    const res = await fetch(metaEndpoint(), {
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
    return fail(
      err?.name === "AbortError" ? "Meta timeout" : String(err?.message || err)
    );
  } finally {
    clearTimeout(timer);
  }
}

function requireRecipient(recipientId) {
  const to = s(recipientId);
  if (!to) return { ok: false, error: "recipientId missing" };
  return { ok: true, value: to };
}

function buildRecipient(recipientId) {
  return { id: s(recipientId) };
}

async function sendText({ recipientId, text, messagingType = "RESPONSE" }) {
  const recipient = requireRecipient(recipientId);
  if (!recipient.ok) return fail(recipient.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postToMeta({
    recipient: buildRecipient(recipient.value),
    messaging_type: s(messagingType || "RESPONSE") || "RESPONSE",
    message: { text: bodyText },
  });
}

async function sendSenderAction({ recipientId, action }) {
  const recipient = requireRecipient(recipientId);
  if (!recipient.ok) return fail(recipient.error);

  const senderAction = lower(action);
  if (!senderAction) return fail("sender action missing");

  return postToMeta({
    recipient: buildRecipient(recipient.value),
    sender_action: senderAction,
  });
}

export async function sendInstagramTextMessage({ recipientId, text }) {
  return sendText({
    recipientId,
    text,
    messagingType: "RESPONSE",
  });
}

export async function sendInstagramSeen({ recipientId }) {
  return sendSenderAction({
    recipientId,
    action: "mark_seen",
  });
}

export async function sendInstagramTypingOn({ recipientId }) {
  return sendSenderAction({
    recipientId,
    action: "typing_on",
  });
}

export async function sendInstagramTypingOff({ recipientId }) {
  return sendSenderAction({
    recipientId,
    action: "typing_off",
  });
}