import { safeStr } from "./http.js";

function s(v) {
  return safeStr(v);
}

function lower(v) {
  return s(v).toLowerCase();
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function cleanText(v) {
  return s(v);
}

function hasText(v) {
  return cleanText(v).length > 0;
}

function normalizeTimestamp(v, fallback = Date.now()) {
  if (v == null || v === "") return fallback;

  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e12) return v;
    if (v > 1e9) return v * 1000;
    return fallback;
  }

  const raw = String(v).trim();
  if (!raw) return fallback;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      if (n > 1e12) return n;
      if (n > 1e9) return n * 1000;
    }
  }

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;

  return fallback;
}

function inferChannelFromMessaging(ev = {}) {
  const platform = lower(ev?.platform);
  if (platform.includes("instagram")) return "instagram";
  if (platform.includes("facebook") || platform.includes("messenger")) return "facebook";
  return "instagram";
}

function inferChannelFromChange(change = {}) {
  const field = lower(change?.field);
  const value = change?.value || {};

  if (field.includes("whatsapp")) return "whatsapp";

  const messagingProduct = lower(value?.messaging_product);
  if (messagingProduct === "whatsapp") return "whatsapp";

  if (field.includes("instagram")) return "instagram";
  if (field.includes("messenger")) return "facebook";
  if (field.includes("comments")) return "instagram";
  if (field.includes("comment")) return "instagram";
  if (field.includes("feed")) return "instagram";

  if (value?.instagram_id || value?.user_id || value?.thread_id) return "instagram";
  return "instagram";
}

function pickMessagingPageId(ev = {}) {
  return (
    s(ev?.recipient?.id) ||
    s(ev?.recipient?.page_id) ||
    s(ev?.page_id) ||
    s(ev?.pageId) ||
    ""
  );
}

function pickMessagingIgUserId(ev = {}) {
  return (
    s(ev?.recipient?.instagram_id) ||
    s(ev?.recipient?.ig_user_id) ||
    s(ev?.ig_user_id) ||
    s(ev?.igUserId) ||
    ""
  );
}

function pickChangePageId(change = {}) {
  const value = change?.value || {};
  return (
    s(value?.page_id) ||
    s(value?.recipient_id) ||
    s(value?.recipient?.id) ||
    s(value?.post?.from?.id) ||
    ""
  );
}

function pickChangeIgUserId(change = {}) {
  const value = change?.value || {};
  return (
    s(value?.instagram_id) ||
    s(value?.ig_user_id) ||
    s(value?.recipient?.instagram_id) ||
    s(value?.recipient?.ig_user_id) ||
    s(value?.from?.id && inferChannelFromChange(change) === "instagram" ? value?.from?.id : "") ||
    ""
  );
}

function pickExternalAccountId({ channel = "", recipientId = "", pageId = "", igUserId = "" }) {
  const ch = lower(channel);
  if (ch === "instagram") {
    return s(igUserId || recipientId || pageId);
  }
  if (ch === "facebook" || ch === "messenger") {
    return s(pageId || recipientId || igUserId);
  }
  if (ch === "whatsapp") {
    return s(recipientId || pageId || igUserId);
  }
  return s(recipientId || pageId || igUserId);
}

function baseEvent({
  channel = "instagram",
  sourceType = "unknown",
  eventType = "unsupported",
  userId = "",
  recipientId = "",
  pageId = "",
  igUserId = "",
  externalAccountId = "",
  text = "",
  timestamp = Date.now(),
  messageId = "",
  mid = "",
  externalThreadId = "",
  username = "",
  customerName = "",
  externalCommentId = "",
  externalParentCommentId = "",
  externalPostId = "",
  raw = null,
  supported = false,
  ignored = false,
  ignoreReason = "",
  hasAttachments = false,
  attachments = [],
}) {
  const safeChannel = s(channel || "instagram").toLowerCase() || "instagram";
  const uid = s(userId);
  const rid = s(recipientId);
  const pgid = s(pageId);
  const igid = s(igUserId);
  const msgId = s(messageId || mid);

  return {
    channel: safeChannel,
    sourceType: s(sourceType || "unknown"),
    eventType: s(eventType || "unsupported"),
    userId: uid,
    recipientId: rid,
    pageId: pgid,
    igUserId: igid,
    externalAccountId:
      s(externalAccountId) ||
      pickExternalAccountId({
        channel: safeChannel,
        recipientId: rid,
        pageId: pgid,
        igUserId: igid,
      }),
    text: cleanText(text),
    timestamp: normalizeTimestamp(timestamp, Date.now()),
    messageId: msgId,
    mid: s(mid || messageId || ""),
    externalThreadId: s(externalThreadId || uid || ""),
    username: s(username),
    customerName: s(customerName),

    externalCommentId: s(externalCommentId),
    externalParentCommentId: s(externalParentCommentId),
    externalPostId: s(externalPostId),

    raw,
    supported: Boolean(supported),
    ignored: Boolean(ignored),
    ignoreReason: s(ignoreReason),
    hasAttachments: Boolean(hasAttachments || attachments.length > 0),
    attachments: arr(attachments),
  };
}

function pickMessagingAttachments(ev = {}) {
  const out = [];
  const items = arr(ev?.message?.attachments);

  for (const item of items) {
    if (!isObject(item)) continue;
    out.push({
      type: s(item?.type || "unknown"),
      payload: isObject(item?.payload) ? item.payload : {},
      raw: item,
    });
  }

  return out;
}

function pickChangeAttachments(value = {}) {
  const out = [];

  for (const msg of arr(value?.messages)) {
    const type = lower(msg?.type);

    if (type && type !== "text") {
      out.push({
        type,
        payload: isObject(msg) ? msg : {},
        raw: msg,
      });
      continue;
    }

    for (const a of arr(msg?.attachments)) {
      out.push({
        type: s(a?.type || "unknown"),
        payload: isObject(a?.payload) ? a.payload : {},
        raw: a,
      });
    }
  }

  return out;
}

function parseMessagingItem(ev = {}) {
  const channel = inferChannelFromMessaging(ev);
  const senderId = s(ev?.sender?.id);
  const recipientId = s(ev?.recipient?.id);
  const pageId = pickMessagingPageId(ev);
  const igUserId = pickMessagingIgUserId(ev);
  const timestamp = normalizeTimestamp(ev?.timestamp, Date.now());
  const message = ev?.message || {};
  const text = cleanText(message?.text);
  const messageId = s(message?.mid || message?.id || "");
  const attachments = pickMessagingAttachments(ev);

  if (ev?.read) {
    return baseEvent({
      channel,
      sourceType: "messaging",
      eventType: "read",
      userId: senderId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      raw: ev,
      supported: false,
      ignored: true,
      ignoreReason: "read_event",
    });
  }

  if (ev?.delivery) {
    return baseEvent({
      channel,
      sourceType: "messaging",
      eventType: "delivery",
      userId: senderId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      raw: ev,
      supported: false,
      ignored: true,
      ignoreReason: "delivery_event",
    });
  }

  if (ev?.reaction) {
    return baseEvent({
      channel,
      sourceType: "messaging",
      eventType: "reaction",
      userId: senderId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      raw: ev,
      supported: false,
      ignored: true,
      ignoreReason: "reaction_event",
    });
  }

  if (message?.is_echo) {
    return baseEvent({
      channel,
      sourceType: "messaging",
      eventType: "echo",
      userId: senderId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      messageId,
      mid: messageId,
      raw: ev,
      supported: false,
      ignored: true,
      ignoreReason: "echo_message",
    });
  }

  if (hasText(text)) {
    return baseEvent({
      channel,
      sourceType: "messaging",
      eventType: "text",
      userId: senderId,
      recipientId,
      pageId,
      igUserId,
      text,
      timestamp,
      messageId,
      mid: messageId,
      externalThreadId: senderId,
      raw: ev,
      supported: true,
    });
  }

  if (attachments.length) {
    return baseEvent({
      channel,
      sourceType: "messaging",
      eventType: "attachment",
      userId: senderId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      messageId,
      mid: messageId,
      externalThreadId: senderId,
      raw: ev,
      supported: false,
      ignored: true,
      ignoreReason: "attachment_only",
      attachments,
      hasAttachments: true,
    });
  }

  return baseEvent({
    channel,
    sourceType: "messaging",
    eventType: "unsupported",
    userId: senderId,
    recipientId,
    pageId,
    igUserId,
    timestamp,
    messageId,
    mid: messageId,
    raw: ev,
    supported: false,
    ignored: true,
    ignoreReason: "unsupported_messaging_event",
  });
}

function parseWhatsAppChange(change = {}) {
  const value = change?.value || {};
  const msg = value?.messages?.[0] || {};
  const text = cleanText(msg?.text?.body);
  const timestamp = normalizeTimestamp(msg?.timestamp, Date.now());
  const messageId = s(msg?.id || "");
  const userId = s(value?.contacts?.[0]?.wa_id) || s(msg?.from);
  const recipientId = s(value?.metadata?.phone_number_id || value?.metadata?.display_phone_number || "");
  const pageId = "";
  const igUserId = "";
  const attachments = pickChangeAttachments(value);
  const type = lower(msg?.type);

  if (type === "reaction") {
    return baseEvent({
      channel: "whatsapp",
      sourceType: "changes",
      eventType: "reaction",
      userId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      messageId,
      mid: messageId,
      raw: change,
      supported: false,
      ignored: true,
      ignoreReason: "reaction_event",
    });
  }

  if (hasText(text)) {
    return baseEvent({
      channel: "whatsapp",
      sourceType: "changes",
      eventType: "text",
      userId,
      recipientId,
      pageId,
      igUserId,
      text,
      timestamp,
      messageId,
      mid: messageId,
      externalThreadId: userId,
      raw: change,
      supported: true,
    });
  }

  if (attachments.length) {
    return baseEvent({
      channel: "whatsapp",
      sourceType: "changes",
      eventType: "attachment",
      userId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      messageId,
      mid: messageId,
      externalThreadId: userId,
      raw: change,
      supported: false,
      ignored: true,
      ignoreReason: "attachment_only",
      attachments,
      hasAttachments: true,
    });
  }

  return baseEvent({
    channel: "whatsapp",
    sourceType: "changes",
    eventType: "unsupported",
    userId,
    recipientId,
    pageId,
    igUserId,
    timestamp,
    messageId,
    mid: messageId,
    raw: change,
    supported: false,
    ignored: true,
    ignoreReason: "unsupported_whatsapp_event",
  });
}

function parseInstagramLikeMessageChange(change = {}) {
  const value = change?.value || {};
  const msg0 = value?.messages?.[0] || {};
  const fromObj = value?.from || {};
  const senderObj = value?.sender || {};
  const recipientObj = value?.recipient || {};

  const text =
    cleanText(value?.message) ||
    cleanText(value?.text) ||
    cleanText(msg0?.message) ||
    cleanText(msg0?.text) ||
    cleanText(msg0?.message?.text);

  const timestamp =
    normalizeTimestamp(msg0?.created_time, 0) ||
    normalizeTimestamp(value?.timestamp, 0) ||
    Date.now();

  const messageId =
    s(msg0?.id) ||
    s(msg0?.mid) ||
    s(value?.message_id) ||
    "";

  const userId =
    s(fromObj?.id) ||
    s(senderObj?.id) ||
    s(value?.user_id) ||
    s(msg0?.from);

  const recipientId =
    s(recipientObj?.id) ||
    s(value?.recipient_id) ||
    "";

  const pageId = pickChangePageId(change);
  const igUserId = pickChangeIgUserId(change);
  const attachments = pickChangeAttachments(value);

  if (hasText(text)) {
    return baseEvent({
      channel: "instagram",
      sourceType: "changes",
      eventType: "text",
      userId,
      recipientId,
      pageId,
      igUserId,
      text,
      timestamp,
      messageId,
      mid: s(msg0?.mid || messageId),
      externalThreadId: userId,
      username: s(value?.username || fromObj?.username || senderObj?.username || ""),
      customerName: s(value?.name || fromObj?.name || senderObj?.name || ""),
      raw: change,
      supported: true,
    });
  }

  if (attachments.length) {
    return baseEvent({
      channel: "instagram",
      sourceType: "changes",
      eventType: "attachment",
      userId,
      recipientId,
      pageId,
      igUserId,
      timestamp,
      messageId,
      mid: s(msg0?.mid || messageId),
      externalThreadId: userId,
      raw: change,
      supported: false,
      ignored: true,
      ignoreReason: "attachment_only",
      attachments,
      hasAttachments: true,
    });
  }

  return baseEvent({
    channel: "instagram",
    sourceType: "changes",
    eventType: "unsupported",
    userId,
    recipientId,
    pageId,
    igUserId,
    timestamp,
    messageId,
    mid: s(msg0?.mid || messageId),
    raw: change,
    supported: false,
    ignored: true,
    ignoreReason: "unsupported_instagram_change",
  });
}

function looksLikeCommentChange(change = {}) {
  const field = lower(change?.field);
  const value = change?.value || {};

  if (field.includes("comments")) return true;
  if (field.includes("comment")) return true;

  if (value?.comment_id || value?.parent_comment_id) return true;
  if (value?.comment?.id || value?.comment?.parent_id) return true;

  if (
    lower(value?.verb) === "add" &&
    (value?.comment_id || value?.message || value?.text || value?.comment_text)
  ) {
    return true;
  }

  return false;
}

function parseCommentChange(change = {}) {
  const value = change?.value || {};
  const field = lower(change?.field);

  const text =
    cleanText(value?.message) ||
    cleanText(value?.text) ||
    cleanText(value?.comment_text) ||
    cleanText(value?.comment?.text) ||
    cleanText(value?.comment?.message) ||
    cleanText(lower(value?.verb) === "add" ? value?.message : "");

  const commentId =
    s(value?.comment_id) ||
    s(value?.id) ||
    s(value?.comment?.id) ||
    "";

  const parentCommentId =
    s(value?.parent_id) ||
    s(value?.parent_comment_id) ||
    s(value?.comment?.parent_id) ||
    "";

  const postId =
    s(value?.post_id) ||
    s(value?.media_id) ||
    s(value?.object_id) ||
    s(value?.post?.id) ||
    s(value?.media?.id) ||
    "";

  const fromObj = value?.from || {};
  const senderObj = value?.sender || {};
  const commentObj = value?.comment || {};

  const userId =
    s(fromObj?.id) ||
    s(senderObj?.id) ||
    s(value?.user_id) ||
    s(value?.commenter_id) ||
    s(commentObj?.from?.id) ||
    "";

  const username =
    s(fromObj?.username) ||
    s(value?.username) ||
    s(senderObj?.username) ||
    s(commentObj?.from?.username) ||
    "";

  const customerName =
    s(fromObj?.name) ||
    s(value?.name) ||
    s(senderObj?.name) ||
    s(commentObj?.from?.name) ||
    "";

  const timestamp =
    normalizeTimestamp(value?.created_time, 0) ||
    normalizeTimestamp(value?.timestamp, 0) ||
    normalizeTimestamp(commentObj?.created_time, 0) ||
    Date.now();

  const channel =
    field.includes("facebook") || field.includes("messenger") ? "facebook" : "instagram";

  const pageId = pickChangePageId(change);
  const igUserId = pickChangeIgUserId(change);

  if (!commentId && !text && !userId) {
    return baseEvent({
      channel,
      sourceType: "changes",
      eventType: "unsupported",
      userId,
      pageId,
      igUserId,
      timestamp,
      raw: change,
      supported: false,
      ignored: true,
      ignoreReason: "unsupported_comment_change",
    });
  }

  if (!hasText(text)) {
    return baseEvent({
      channel,
      sourceType: "changes",
      eventType: "comment",
      userId,
      recipientId: "",
      pageId,
      igUserId,
      text: "",
      timestamp,
      messageId: commentId,
      mid: commentId,
      externalThreadId: userId,
      externalCommentId: commentId,
      externalParentCommentId: parentCommentId,
      externalPostId: postId,
      username,
      customerName,
      raw: change,
      supported: false,
      ignored: true,
      ignoreReason: "empty_comment_text",
    });
  }

  return baseEvent({
    channel,
    sourceType: "changes",
    eventType: "comment",
    userId,
    recipientId: "",
    pageId,
    igUserId,
    text,
    timestamp,
    messageId: commentId,
    mid: commentId,
    externalThreadId: userId,
    externalCommentId: commentId,
    externalParentCommentId: parentCommentId,
    externalPostId: postId,
    username,
    customerName,
    raw: change,
    supported: true,
    ignored: false,
  });
}

function parseChangeItem(change = {}) {
  const channel = inferChannelFromChange(change);

  if (channel === "whatsapp") return parseWhatsAppChange(change);

  if (looksLikeCommentChange(change)) {
    return parseCommentChange(change);
  }

  return parseInstagramLikeMessageChange(change);
}

export function extractMetaEvents(body) {
  const out = [];

  if (!Array.isArray(body?.entry)) return out;

  for (const entry of body.entry) {
    for (const m of arr(entry?.messaging)) {
      out.push(parseMessagingItem(m));
    }

    for (const c of arr(entry?.changes)) {
      out.push(parseChangeItem(c));
    }
  }

  return out;
}

export function pickFirstSupportedTextEvent(body) {
  const events = extractMetaEvents(body);
  return (
    events.find(
      (ev) =>
        ev &&
        ev.supported === true &&
        ev.ignored !== true &&
        ev.eventType === "text" &&
        hasText(ev.text) &&
        s(ev.userId)
    ) || null
  );
}

export function pickFirstSupportedCommentEvent(body) {
  const events = extractMetaEvents(body);
  return (
    events.find(
      (ev) =>
        ev &&
        ev.supported === true &&
        ev.ignored !== true &&
        ev.eventType === "comment" &&
        hasText(ev.text) &&
        s(ev.externalCommentId)
    ) || null
  );
}

export function pickFirstTextEvent(body) {
  return pickFirstSupportedTextEvent(body);
}