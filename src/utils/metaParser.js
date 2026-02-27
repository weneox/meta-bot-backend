// src/utils/metaParser.js
import { safeStr } from "./http.js";

export function pickFirstTextEvent(body) {
  // entry[].messaging[] (IG classic)
  // entry[].changes[] (WhatsApp Cloud / IG Graph)
  const items = [];

  if (Array.isArray(body?.entry)) {
    for (const entry of body.entry) {
      if (Array.isArray(entry?.messaging)) {
        for (const m of entry.messaging) items.push(m);
      }
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
      };
    }
  }

  // B) changes event
  for (const ev of items) {
    const value = ev?.value;

    // WhatsApp Cloud: value.messages[0].text.body
    const waText = safeStr(value?.messages?.[0]?.text?.body);
    if (waText) {
      return {
        channel: "whatsapp",
        userId: safeStr(value?.contacts?.[0]?.wa_id) || safeStr(value?.messages?.[0]?.from),
        text: waText,
        timestamp: value?.messages?.[0]?.timestamp
          ? Number(value.messages[0].timestamp) * 1000
          : Date.now(),
      };
    }

    // IG variants
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
      };
    }
  }

  return null;
}