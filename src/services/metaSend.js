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

function graphBase() {
  const version = s(META_API_VERSION || "v23.0") || "v23.0";
  return `https://graph.facebook.com/${version}`;
}

function metaMessagesEndpoint() {
  return `${graphBase()}/me/messages`;
}

function graphNodeEndpoint(nodeId, edge = "") {
  const id = encodeURIComponent(s(nodeId));
  const cleanEdge = s(edge).replace(/^\/+/, "");
  return cleanEdge ? `${graphBase()}/${id}/${cleanEdge}` : `${graphBase()}/${id}`;
}

async function postJson(url, body) {
  const token = s(META_PAGE_ACCESS_TOKEN);
  if (!token) {
    return fail("META_PAGE_ACCESS_TOKEN missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_REPLY_TIMEOUT_MS);

  try {
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
    return fail(
      err?.name === "AbortError" ? "Meta timeout" : String(err?.message || err)
    );
  } finally {
    clearTimeout(timer);
  }
}

async function postForm(url, params) {
  const token = s(META_PAGE_ACCESS_TOKEN);
  if (!token) {
    return fail("META_PAGE_ACCESS_TOKEN missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_REPLY_TIMEOUT_MS);

  try {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v == null) continue;
      body.set(k, String(v));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body,
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

function requireCommentId(commentId) {
  const id = s(commentId);
  if (!id) return { ok: false, error: "commentId missing" };
  return { ok: true, value: id };
}

function buildRecipient(recipientId) {
  return { id: s(recipientId) };
}

async function sendText({ recipientId, text, messagingType = "RESPONSE" }) {
  const recipient = requireRecipient(recipientId);
  if (!recipient.ok) return fail(recipient.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postJson(metaMessagesEndpoint(), {
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

  return postJson(metaMessagesEndpoint(), {
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

/**
 * Instagram public comment reply
 * Docs indicate replies are created on /{ig-comment-id}/replies with a message param.
 */
export async function sendInstagramCommentReply({ commentId, text }) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(graphNodeEndpoint(comment.value, "replies"), {
    message: bodyText,
  });
}

/**
 * Facebook Page public comment reply
 * Reply is created by posting a comment on the parent comment via /{comment-id}/comments.
 */
export async function sendFacebookCommentReply({ commentId, text }) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(graphNodeEndpoint(comment.value, "comments"), {
    message: bodyText,
  });
}