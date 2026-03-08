import {
  sendInstagramTextMessage,
  sendInstagramSeen,
  sendInstagramTypingOn,
  sendInstagramTypingOff,
} from "./metaSend.js";
import { notifyAiHqOutbound } from "./aihqOutboundClient.js";

function s(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return s(v).toLowerCase();
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeActions(input) {
  return Array.isArray(input) ? input : [];
}

function okResult({ type, channel, meta = null, response = null }) {
  return {
    type: s(type || "unknown"),
    channel: s(channel || "unknown"),
    ok: true,
    status: 200,
    error: null,
    meta,
    response,
  };
}

function failResult({ type, channel, error, status = 0, meta = null, response = null }) {
  return {
    type: s(type || "unknown"),
    channel: s(channel || "unknown"),
    ok: false,
    status: Number(status || 0),
    error: s(error || "unknown error"),
    meta,
    response,
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

function pickRecipientId(action, ctx = {}) {
  return s(action?.recipientId) || s(ctx?.recipientId) || s(ctx?.userId);
}

function normalizeChannel(action, ctx = {}) {
  return lower(action?.channel || ctx?.channel || "instagram") || "instagram";
}

function needsRecipient(type) {
  return ["send_message", "mark_seen", "send_seen", "typing_on", "typing_off"].includes(type);
}

function getChannelCapabilities(channel) {
  const ch = lower(channel);

  if (ch === "instagram") {
    return {
      supported: true,
      sendText: sendInstagramTextMessage,
      sendSeen: sendInstagramSeen,
      typingOn: sendInstagramTypingOn,
      typingOff: sendInstagramTypingOff,
      supportsSeen: true,
      supportsTyping: true,
    };
  }

  return {
    supported: false,
    sendText: null,
    sendSeen: null,
    typingOn: null,
    typingOff: null,
    supportsSeen: false,
    supportsTyping: false,
  };
}

async function ackOutboundToAiHq({ action, ctx, providerResponse }) {
  const meta = isObject(action?.meta) ? action.meta : {};

  const payload = {
    tenantKey: s(meta?.tenantKey || ctx?.tenantKey || "neox") || "neox",
    channel: normalizeChannel(action, ctx),
    threadId: s(meta?.threadId || ctx?.threadId || ""),
    recipientId: pickRecipientId(action, ctx),
    text: s(action?.text || ""),
    direction: "outbound",
    senderType: "ai",
    provider: "meta",
    providerMessageId: s(
      providerResponse?.message_id ||
        providerResponse?.messageId ||
        providerResponse?.id ||
        ""
    ),
    meta: {
      actionMeta: meta,
      providerResponse: providerResponse || null,
    },
  };

  if (!payload.threadId) {
    return {
      ok: false,
      status: 0,
      error: "threadId missing for outbound ack",
    };
  }

  return notifyAiHqOutbound(payload);
}

async function runSendMessage({ action, ctx, channel, recipientId, meta, sender }) {
  const text = s(action?.text);
  if (!text) {
    return failResult({
      type: "send_message",
      channel,
      error: "text missing",
      meta,
    });
  }

  const out = await sender({
    recipientId,
    text,
  });

  let outboundAck = null;

  if (out.ok) {
    outboundAck = await ackOutboundToAiHq({
      action,
      ctx,
      providerResponse: out.json || null,
    });

    if (outboundAck?.ok) {
      logInfo("outbound ack synced to AI HQ", {
        threadId: s(meta?.threadId || ctx?.threadId || ""),
        providerMessageId: s(
          out?.json?.message_id || out?.json?.messageId || out?.json?.id || ""
        ),
      });
    } else {
      logWarn("outbound ack failed after successful send_message", {
        threadId: s(meta?.threadId || ctx?.threadId || ""),
        recipientId,
        error: s(outboundAck?.error || "unknown outbound ack error"),
        status: Number(outboundAck?.status || 0),
      });
    }
  } else {
    logWarn("send_message failed", {
      threadId: s(meta?.threadId || ctx?.threadId || ""),
      recipientId,
      error: s(out?.error || "unknown send error"),
      status: Number(out?.status || 0),
    });
  }

  return {
    type: "send_message",
    channel,
    ok: Boolean(out.ok),
    status: Number(out.status || 0),
    error: out.error || null,
    meta: {
      ...(meta || {}),
      outboundAck: outboundAck || null,
    },
    response: out.json || null,
  };
}

async function runSeen({ type, channel, recipientId, meta, sender }) {
  const out = await sender({ recipientId });

  if (!out.ok) {
    logWarn("mark_seen failed", {
      recipientId,
      error: s(out?.error || "unknown mark_seen error"),
      status: Number(out?.status || 0),
    });
  }

  return {
    type,
    channel,
    ok: Boolean(out.ok),
    status: Number(out.status || 0),
    error: out.error || null,
    meta,
    response: out.json || null,
  };
}

async function runTyping({ type, channel, recipientId, meta, sender, logLabel }) {
  const out = await sender({ recipientId });

  if (!out.ok) {
    logWarn(`${logLabel} failed`, {
      recipientId,
      error: s(out?.error || `unknown ${logLabel} error`),
      status: Number(out?.status || 0),
    });
  }

  return {
    type,
    channel,
    ok: Boolean(out.ok),
    status: Number(out.status || 0),
    error: out.error || null,
    meta,
    response: out.json || null,
  };
}

function buildPassiveSuccess(type, channel, action, meta) {
  if (type === "create_lead") {
    return okResult({
      type,
      channel,
      meta: {
        ...(meta || {}),
        lead: action?.lead || null,
        note: "lead already persisted in AI HQ",
      },
    });
  }

  if (type === "handoff") {
    return okResult({
      type,
      channel,
      meta: {
        ...(meta || {}),
        reason: s(action?.reason || "manual_review"),
        priority: s(action?.priority || "normal"),
        note: "handoff already persisted in AI HQ",
      },
    });
  }

  if (type === "no_reply") {
    return okResult({
      type,
      channel,
      meta: {
        ...(meta || {}),
        reason: s(action?.reason || "rule_suppressed"),
      },
    });
  }

  return null;
}

export async function executeMetaActions(actions, ctx = {}) {
  const list = normalizeActions(actions);
  const results = [];

  for (const action of list) {
    const type = lower(action?.type);
    const channel = normalizeChannel(action, ctx);
    const meta = isObject(action?.meta) ? action.meta : null;
    const recipientId = pickRecipientId(action, ctx);
    const caps = getChannelCapabilities(channel);

    if (!type) {
      results.push(
        failResult({
          type: "unknown",
          channel,
          error: "action type missing",
          meta,
        })
      );
      continue;
    }

    if (!caps.supported) {
      results.push(
        failResult({
          type,
          channel,
          error: "unsupported channel",
          meta,
        })
      );
      continue;
    }

    if (needsRecipient(type) && !recipientId) {
      results.push(
        failResult({
          type,
          channel,
          error: "recipientId missing",
          meta,
        })
      );
      continue;
    }

    if (type === "send_message") {
      results.push(
        await runSendMessage({
          action,
          ctx,
          channel,
          recipientId,
          meta,
          sender: caps.sendText,
        })
      );
      continue;
    }

    if (type === "mark_seen" || type === "send_seen") {
      if (!caps.supportsSeen || !caps.sendSeen) {
        results.push(
          failResult({
            type,
            channel,
            error: "seen action not supported for channel",
            meta,
          })
        );
        continue;
      }

      results.push(
        await runSeen({
          type,
          channel,
          recipientId,
          meta,
          sender: caps.sendSeen,
        })
      );
      continue;
    }

    if (type === "typing_on") {
      if (!caps.supportsTyping || !caps.typingOn) {
        results.push(
          failResult({
            type,
            channel,
            error: "typing_on not supported for channel",
            meta,
          })
        );
        continue;
      }

      results.push(
        await runTyping({
          type,
          channel,
          recipientId,
          meta,
          sender: caps.typingOn,
          logLabel: "typing_on",
        })
      );
      continue;
    }

    if (type === "typing_off") {
      if (!caps.supportsTyping || !caps.typingOff) {
        results.push(
          failResult({
            type,
            channel,
            error: "typing_off not supported for channel",
            meta,
          })
        );
        continue;
      }

      results.push(
        await runTyping({
          type,
          channel,
          recipientId,
          meta,
          sender: caps.typingOff,
          logLabel: "typing_off",
        })
      );
      continue;
    }

    const passive = buildPassiveSuccess(type, channel, action, meta);
    if (passive) {
      results.push(passive);
      continue;
    }

    logWarn("unsupported action", {
      type: type || "unknown",
      channel: channel || "unknown",
    });

    results.push(
      failResult({
        type: type || "unknown",
        channel: channel || "unknown",
        error: "unsupported action",
        meta,
      })
    );
  }

  return {
    ok: results.every((x) => x.ok),
    results,
  };
}