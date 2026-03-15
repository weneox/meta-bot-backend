import {
  META_PAGE_ACCESS_TOKEN,
  META_API_VERSION,
  META_REPLY_TIMEOUT_MS,
  META_TOKEN_FALLBACK_ENABLED,
} from "../config.js";
import { getTenantMetaConfigByChannel } from "./tenantProviderSecrets.js";

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

function logInfo(message, data = null) {
  try {
    if (data) console.log(`[meta-bot] ${message}`, data);
    else console.log(`[meta-bot] ${message}`);
  } catch {}
}

function logWarn(message, data = null) {
  try {
    if (data) console.warn(`[meta-bot] ${message}`, data);
    else console.warn(`[meta-bot] ${message}`);
  } catch {}
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

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const x = s(v);
    if (x) return x;
  }
  return "";
}

async function resolveMetaAccessToken({
  tenantKey = "",
  channel = "instagram",
  recipientId = "",
  pageId = "",
  igUserId = "",
  meta = null,
} = {}) {
  const envToken = s(META_PAGE_ACCESS_TOKEN);
  const safeTenantKey = lower(tenantKey);
  const allowEnvFallback = Boolean(META_TOKEN_FALLBACK_ENABLED);

  const safeMeta = meta && typeof meta === "object" ? meta : {};

  const safeChannel = lower(channel || "instagram") || "instagram";
  const safeRecipientId = firstNonEmpty(
    recipientId,
    safeMeta.recipientId,
    safeMeta.externalRecipientId
  );

  const safePageId = firstNonEmpty(
    pageId,
    safeMeta.pageId,
    safeMeta.page_id,
    safeMeta.externalPageId,
    safeMeta.external_page_id
  );

  const safeIgUserId = firstNonEmpty(
    igUserId,
    safeMeta.igUserId,
    safeMeta.ig_user_id,
    safeMeta.instagramBusinessAccountId,
    safeMeta.instagram_business_account_id,
    safeMeta.externalUserId,
    safeMeta.external_user_id
  );

  try {
    const metaCfg = await getTenantMetaConfigByChannel({
      channel: safeChannel,
      recipientId: safeRecipientId,
      pageId: safePageId,
      igUserId: safeIgUserId,
    });

    const tenantToken = s(metaCfg?.pageAccessToken);

    logInfo("meta credential resolve", {
      tenantKey: safeTenantKey,
      channel: safeChannel,
      recipientId: safeRecipientId,
      pageId: safePageId,
      igUserId: safeIgUserId,
      hasTenantToken: Boolean(tenantToken),
      source: s(metaCfg?.source || ""),
      error: s(metaCfg?.error || ""),
      status: Number(metaCfg?.status || 0),
    });

    if (tenantToken) {
      return {
        accessToken: tenantToken,
        source: "tenant_secret",
        pageId: s(metaCfg?.pageId || safePageId),
        igUserId: s(metaCfg?.igUserId || safeIgUserId),
      };
    }
  } catch (err) {
    logWarn("meta credential resolve failed", {
      tenantKey: safeTenantKey,
      channel: safeChannel,
      recipientId: safeRecipientId,
      pageId: safePageId,
      igUserId: safeIgUserId,
      error: s(err?.message || err),
    });
  }

  if (allowEnvFallback && envToken) {
    return {
      accessToken: envToken,
      source: "env",
      pageId: safePageId,
      igUserId: safeIgUserId,
    };
  }

  return {
    accessToken: "",
    source: "none",
    pageId: safePageId,
    igUserId: safeIgUserId,
  };
}

async function postJson(url, body, opts = {}) {
  const safeTenantKey = lower(opts?.tenantKey || "");
  const safeChannel = lower(opts?.channel || "instagram") || "instagram";
  const safeRecipientId = s(opts?.recipientId || "");
  const safePageId = s(opts?.pageId || "");
  const safeIgUserId = s(opts?.igUserId || "");
  const safeMeta = opts?.meta && typeof opts.meta === "object" ? opts.meta : {};

  const creds = await resolveMetaAccessToken({
    tenantKey: safeTenantKey,
    channel: safeChannel,
    recipientId: safeRecipientId,
    pageId: safePageId,
    igUserId: safeIgUserId,
    meta: safeMeta,
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
        channel: safeChannel,
        recipientId: safeRecipientId,
        pageId: safePageId,
        igUserId: safeIgUserId,
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
        channel: safeChannel,
        recipientId: safeRecipientId,
        pageId: safePageId,
        igUserId: safeIgUserId,
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
        channel: safeChannel,
        recipientId: safeRecipientId,
        pageId: safePageId,
        igUserId: safeIgUserId,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function postForm(url, params, opts = {}) {
  const safeTenantKey = lower(opts?.tenantKey || "");
  const safeChannel = lower(opts?.channel || "instagram") || "instagram";
  const safeRecipientId = s(opts?.recipientId || "");
  const safePageId = s(opts?.pageId || "");
  const safeIgUserId = s(opts?.igUserId || "");
  const safeMeta = opts?.meta && typeof opts.meta === "object" ? opts.meta : {};

  const creds = await resolveMetaAccessToken({
    tenantKey: safeTenantKey,
    channel: safeChannel,
    recipientId: safeRecipientId,
    pageId: safePageId,
    igUserId: safeIgUserId,
    meta: safeMeta,
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
        channel: safeChannel,
        recipientId: safeRecipientId,
        pageId: safePageId,
        igUserId: safeIgUserId,
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
        channel: safeChannel,
        recipientId: safeRecipientId,
        pageId: safePageId,
        igUserId: safeIgUserId,
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
        channel: safeChannel,
        recipientId: safeRecipientId,
        pageId: safePageId,
        igUserId: safeIgUserId,
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
  pageId = "",
  igUserId = "",
  meta = null,
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
    {
      tenantKey,
      channel: "instagram",
      recipientId: recipient.value,
      pageId,
      igUserId,
      meta,
    }
  );
}

async function sendSenderAction({
  recipientId,
  action,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
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
    {
      tenantKey,
      channel: "instagram",
      recipientId: recipient.value,
      pageId,
      igUserId,
      meta,
    }
  );
}

async function sendPrivateCommentReply({
  commentId,
  text,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(
    graphNodeEndpoint(comment.value, "private_replies"),
    { message: bodyText },
    {
      tenantKey,
      channel: "instagram",
      pageId,
      igUserId,
      meta,
    }
  );
}

export async function sendInstagramTextMessage({
  recipientId,
  text,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  return sendText({
    recipientId,
    text,
    messagingType: "RESPONSE",
    tenantKey,
    pageId,
    igUserId,
    meta,
  });
}

export async function sendInstagramSeen({
  recipientId,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  return sendSenderAction({
    recipientId,
    action: "mark_seen",
    tenantKey,
    pageId,
    igUserId,
    meta,
  });
}

export async function sendInstagramTypingOn({
  recipientId,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  return sendSenderAction({
    recipientId,
    action: "typing_on",
    tenantKey,
    pageId,
    igUserId,
    meta,
  });
}

export async function sendInstagramTypingOff({
  recipientId,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  return sendSenderAction({
    recipientId,
    action: "typing_off",
    tenantKey,
    pageId,
    igUserId,
    meta,
  });
}

export async function sendInstagramCommentReply({
  commentId,
  text,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(
    graphNodeEndpoint(comment.value, "replies"),
    { message: bodyText },
    {
      tenantKey,
      channel: "instagram",
      pageId,
      igUserId,
      meta,
    }
  );
}

export async function sendInstagramPrivateCommentReply({
  commentId,
  text,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  return sendPrivateCommentReply({
    commentId,
    text,
    tenantKey,
    pageId,
    igUserId,
    meta,
  });
}

export async function sendFacebookCommentReply({
  commentId,
  text,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  const comment = requireCommentId(commentId);
  if (!comment.ok) return fail(comment.error);

  const bodyText = s(text);
  if (!bodyText) return fail("text missing");

  return postForm(
    graphNodeEndpoint(comment.value, "comments"),
    { message: bodyText },
    {
      tenantKey,
      channel: "facebook",
      pageId,
      igUserId,
      meta,
    }
  );
}

export async function sendFacebookPrivateCommentReply({
  commentId,
  text,
  tenantKey = "",
  pageId = "",
  igUserId = "",
  meta = null,
}) {
  return sendPrivateCommentReply({
    commentId,
    text,
    tenantKey,
    pageId,
    igUserId,
    meta,
  });
}