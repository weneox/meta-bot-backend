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

  if (value?.instagram_id || value?.user_id || value?.thread_id) return "instagram";
  return "instagram";
}

function baseEvent({
  channel = "instagram",
  sourceType = "unknown",
  eventType = "unsupported",
  userId = "",
  recipientId = "",
  text = "",
  timestamp = Date.now(),
  messageId = "",
  mid = "",
  externalThreadId = "",
  username = "",
  customerName = "",
  raw = null,
  supported = false,
  ignored = false,
  ignoreReason = "",
  hasAttachments = false,
  attachments = [],
}) {
  const uid = s(userId);
  const rid = s(recipientId);
  const msgId = s(messageId || mid);

  return {
    channel: s(channel || "instagram").toLowerCase() || "instagram",
    sourceType: s(sourceType || "unknown"),
    eventType: s(eventType || "unsupported"),
    userId: uid,
    recipientId: rid,
    text: cleanText(text),
    timestamp: toNum(timestamp, Date.now()) || Date.now(),
    messageId: msgId,
    mid: s(mid || messageId || ""),
    externalThreadId: s(externalThreadId || uid || ""),
    username: s(username),
    customerName: s(customerName),
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
  const timestamp = toNum(ev?.timestamp, Date.now());
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
  const timestamp = msg?.timestamp ? toNum(msg.timestamp, 0) * 1000 : Date.now();
  const messageId = s(msg?.id || "");
  const userId = s(value?.contacts?.[0]?.wa_id) || s(msg?.from);
  const recipientId = s(value?.metadata?.display_phone_number || "");
  const attachments = pickChangeAttachments(value);
  const type = lower(msg?.type);

  if (type === "reaction") {
    return baseEvent({
      channel: "whatsapp",
      sourceType: "changes",
      eventType: "reaction",
      userId,
      recipientId,
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
    timestamp,
    messageId,
    mid: messageId,
    raw: change,
    supported: false,
    ignored: true,
    ignoreReason: "unsupported_whatsapp_event",
  });
}

function parseInstagramLikeChange(change = {}) {
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
    toNum(msg0?.created_time, 0) ||
    toNum(value?.timestamp, 0) ||
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

  const attachments = pickChangeAttachments(value);

  if (hasText(text)) {
    return baseEvent({
      channel: "instagram",
      sourceType: "changes",
      eventType: "text",
      userId,
      recipientId,
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
    timestamp,
    messageId,
    mid: s(msg0?.mid || messageId),
    raw: change,
    supported: false,
    ignored: true,
    ignoreReason: "unsupported_instagram_change",
  });
}

function parseChangeItem(change = {}) {
  const channel = inferChannelFromChange(change);
  if (channel === "whatsapp") return parseWhatsAppChange(change);
  return parseInstagramLikeChange(change);
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

// backward-compatible alias
export function pickFirstTextEvent(body) {
  return pickFirstSupportedTextEvent(body);
}