import {
  META_PAGE_ACCESS_TOKEN,
  META_API_VERSION,
  META_REPLY_TIMEOUT_MS,
  META_TOKEN_FALLBACK_ENABLED,
} from "../config.js";
import { getTenantMetaConfig } from "./tenantProviderSecrets.js";

function s(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return s(v).toLowerCase();
}

function fail(error, status = 0, json = null, meta = null) {
  return {
    ok: false,
    status: Number(status || 0),
    error: s(error || "unknown error"),
    json,
    meta,
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

async function resolveMetaAccessToken({ tenantKey = "" } = {}) {
  const envToken = s(META_PAGE_ACCESS_TOKEN);
  const safeTenantKey = lower(tenantKey);
  const allowEnvFallback = Boolean(META_TOKEN_FALLBACK_ENABLED);

  if (safeTenantKey) {
    try {
      const metaCfg = await getTenantMetaConfig(safeTenantKey);
      const tenantToken = s(metaCfg?.pageAccessToken);

      if (tenantToken) {
        return {
          accessToken: tenantToken,
          source: "tenant_secret",
        };
      }
    } catch {
      // ignore and continue to fallback
    }
  }

  if (allowEnvFallback && envToken) {
    return {
      accessToken: envToken,
      source: "env",
    };
  }

  return {
    accessToken: "",
    source: "none",
  };
}

async function postJson(url, body, opts = {}) {
  const safeTenantKey = lower(opts?.tenantKey || "");
  const creds = await resolveMetaAccessToken({
    tenantKey: safeTenantKey,
  });

  const token = s(creds.accessToken);
  if (!token) {
    return fail(
      "META_PAGE_ACCESS_TOKEN missing and tenant meta secret not found",
      0,
      null,
      {
        credentialSource: creds.source,
        tenantKey: safeTenantKey,
      }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(META_REPLY_TIMEOUT_MS || 20000)
  );

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
      meta: {
        credentialSource: creds.source,
        tenantKey: safeTenantKey,
      },
    };
  } catch (err) {
    return fail(
      err?.name === "AbortError" ? "Meta timeout" : String(err?.message || err),
      0,
      null,
      {
        credentialSource: creds.source,
        tenantKey: safeTenantKey,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function postForm(url, params, opts = {}) {
  const safeTenantKey = lower(opts?.tenantKey || "");
  const creds = await resolveMetaAccessToken({
    tenantKey: safeTenantKey,
  });

  const token = s(creds.accessToken);
  if (!token) {
    return fail(
      "META_PAGE_ACCESS_TOKEN missing and tenant meta secret not found",
      0,
      null,
      {
        credentialSource: creds.source,
        tenantKey: safeTenantKey,
      }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(META_REPLY_TIMEOUT_MS || 20000)
  );

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
      meta: {
        credentialSource: creds.source,
        tenantKey: safeTenantKey,
      },
    };
  } catch (err) {
    return fail(
      err?.name === "AbortError" ? "Meta timeout" : String(err?.message || err),
      0,
      null,
      {
        credentialSource: creds.source,
        tenantKey: safeTenantKey,
      }
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

async function sendText({
  recipientId,
  text,
  messagingType = "RESPONSE",
  tenantKey = "",
}) {
  const recipient = requireRecipient(recipientId);
  if (!recipient.ok) return fail(recipient.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postJson(
    metaMessagesEndpoint(),
    {
      recipient: buildRecipient(recipient.value),
      messaging_type: s(messagingType || "RESPONSE") || "RESPONSE",
      message: { text: bodyText },
    },
    { tenantKey }
  );
}

async function sendSenderAction({ recipientId, action, tenantKey = "" }) {
  const recipient = requireRecipient(recipientId);
  if (!recipient.ok) return fail(recipient.error);

  const senderAction = lower(action);
  if (!senderAction) return fail("sender action missing");

  return postJson(
    metaMessagesEndpoint(),
    {
      recipient: buildRecipient(recipient.value),
      sender_action: senderAction,
    },
    { tenantKey }
  );
}

async function sendPrivateCommentReply({
  commentId,
  text,
  tenantKey = "",
}) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(
    graphNodeEndpoint(comment.value, "private_replies"),
    { message: bodyText },
    { tenantKey }
  );
}

export async function sendInstagramTextMessage({
  recipientId,
  text,
  tenantKey = "",
}) {
  return sendText({
    recipientId,
    text,
    messagingType: "RESPONSE",
    tenantKey,
  });
}

export async function sendInstagramSeen({
  recipientId,
  tenantKey = "",
}) {
  return sendSenderAction({
    recipientId,
    action: "mark_seen",
    tenantKey,
  });
}

export async function sendInstagramTypingOn({
  recipientId,
  tenantKey = "",
}) {
  return sendSenderAction({
    recipientId,
    action: "typing_on",
    tenantKey,
  });
}

export async function sendInstagramTypingOff({
  recipientId,
  tenantKey = "",
}) {
  return sendSenderAction({
    recipientId,
    action: "typing_off",
    tenantKey,
  });
}

export async function sendInstagramCommentReply({
  commentId,
  text,
  tenantKey = "",
}) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(
    graphNodeEndpoint(comment.value, "replies"),
    { message: bodyText },
    { tenantKey }
  );
}

export async function sendInstagramPrivateCommentReply({
  commentId,
  text,
  tenantKey = "",
}) {
  return sendPrivateCommentReply({
    commentId,
    text,
    tenantKey,
  });
}

export async function sendFacebookCommentReply({
  commentId,
  text,
  tenantKey = "",
}) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(
    graphNodeEndpoint(comment.value, "comments"),
    { message: bodyText },
    { tenantKey }
  );
}

export async function sendFacebookPrivateCommentReply({
  commentId,
  text,
  tenantKey = "",
}) {
  return sendPrivateCommentReply({
    commentId,
    text,
    tenantKey,
  });
}