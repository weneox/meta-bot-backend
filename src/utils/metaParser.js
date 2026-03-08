import { safeStr } from "./http.js";

function s(v) {
  return safeStr(v);
}

export function pickFirstTextEvent(body) {
  const items = [];

  if (Array.isArray(body?.entry)) {
    for (const entry of body.entry) {
      if (Array.isArray(entry?.messaging)) {
        for (const m of entry.messaging) items.push({ kind: "messaging", raw: m });
      }

      if (Array.isArray(entry?.changes)) {
        for (const c of entry.changes) items.push({ kind: "changes", raw: c });
      }
    }
  }

  // A) Classic messaging events (Instagram / Messenger style)
  for (const item of items) {
    if (item.kind !== "messaging") continue;
    const ev = item.raw;

    const text = s(ev?.message?.text);
    if (!text) continue;

    const senderId = s(ev?.sender?.id);
    const recipientId = s(ev?.recipient?.id);
    const mid = s(ev?.message?.mid || ev?.message?.id || "");

    let channel = "instagram";
    if (ev?.platform) {
      const p = s(ev.platform).toLowerCase();
      if (p.includes("instagram")) channel = "instagram";
      else if (p.includes("facebook") || p.includes("messenger")) channel = "facebook";
    }

    return {
      channel,
      userId: senderId,
      recipientId,
      text,
      timestamp: Number(ev?.timestamp || Date.now()),
      messageId: mid,
      mid,
      raw: ev,
    };
  }

  // B) changes[] events (WhatsApp / Instagram Graph variants)
  for (const item of items) {
    if (item.kind !== "changes") continue;
    const ev = item.raw;
    const value = ev?.value || {};

    // WhatsApp Cloud
    const waText = s(value?.messages?.[0]?.text?.body);
    if (waText) {
      const msg = value?.messages?.[0] || {};
      return {
        channel: "whatsapp",
        userId: s(value?.contacts?.[0]?.wa_id) || s(msg?.from),
        recipientId: s(value?.metadata?.display_phone_number || ""),
        text: waText,
        timestamp: msg?.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
        messageId: s(msg?.id || ""),
        mid: s(msg?.id || ""),
        raw: ev,
      };
    }

    // Instagram Graph-style variants
    const igText =
      s(value?.message) ||
      s(value?.text) ||
      s(value?.messages?.[0]?.message) ||
      s(value?.messages?.[0]?.text) ||
      s(value?.messages?.[0]?.message?.text);

    if (igText) {
      const msg0 = value?.messages?.[0] || {};
      const fromObj = value?.from || {};
      const senderObj = value?.sender || {};

      return {
        channel: "instagram",
        userId:
          s(fromObj?.id) ||
          s(senderObj?.id) ||
          s(value?.user_id) ||
          s(msg0?.from),
        recipientId:
          s(value?.recipient?.id) ||
          s(value?.recipient_id) ||
          "",
        text: igText,
        timestamp:
          Number(msg0?.created_time || 0) ||
          Number(value?.timestamp || 0) ||
          Date.now(),
        messageId:
          s(msg0?.id) ||
          s(msg0?.mid) ||
          s(value?.message_id) ||
          "",
        mid:
          s(msg0?.mid) ||
          s(msg0?.id) ||
          s(value?.message_id) ||
          "",
        raw: ev,
      };
    }
  }

  return null;
}