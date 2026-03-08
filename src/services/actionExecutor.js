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
    status,
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

async function ackOutboundToAiHq({ action, ctx, providerResponse }) {
  const meta = action?.meta && typeof action.meta === "object" ? action.meta : {};

  const payload = {
    tenantKey: s(meta?.tenantKey || ctx?.tenantKey || "neox") || "neox",
    channel: s(action?.channel || ctx?.channel || "instagram").toLowerCase() || "instagram",
    threadId: s(meta?.threadId || ctx?.threadId || ""),
    recipientId: s(action?.recipientId || ctx?.recipientId || ctx?.userId || ""),
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

export async function executeMetaActions(actions, ctx = {}) {
  const list = normalizeActions(actions);
  const results = [];

  for (const action of list) {
    const type = s(action?.type).toLowerCase();
    const channel = s(action?.channel || ctx.channel || "instagram").toLowerCase();
    const meta = action?.meta && typeof action.meta === "object" ? action.meta : null;

    const recipientId =
      s(action?.recipientId) ||
      s(ctx.recipientId) ||
      s(ctx.userId);

    if (channel !== "instagram") {
      results.push(
        failResult({
          type: type || "unknown",
          channel: channel || "unknown",
          error: "unsupported channel",
          meta,
        })
      );
      continue;
    }

    if (!recipientId && ["send_message", "mark_seen", "send_seen", "typing_on", "typing_off"].includes(type)) {
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
      const text = s(action?.text);

      if (!text) {
        results.push(
          failResult({
            type,
            channel,
            error: "text missing",
            meta,
          })
        );
        continue;
      }

      const out = await sendInstagramTextMessage({
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

      results.push({
        type,
        channel,
        ok: out.ok,
        status: out.status,
        error: out.error || null,
        meta: {
          ...(meta || {}),
          outboundAck: outboundAck || null,
        },
        response: out.json || null,
      });
      continue;
    }

    if (type === "mark_seen" || type === "send_seen") {
      const out = await sendInstagramSeen({ recipientId });

      if (!out.ok) {
        logWarn("mark_seen failed", {
          recipientId,
          error: s(out?.error || "unknown mark_seen error"),
          status: Number(out?.status || 0),
        });
      }

      results.push({
        type,
        channel,
        ok: out.ok,
        status: out.status,
        error: out.error || null,
        meta,
        response: out.json || null,
      });
      continue;
    }

    if (type === "typing_on") {
      const out = await sendInstagramTypingOn({ recipientId });

      if (!out.ok) {
        logWarn("typing_on failed", {
          recipientId,
          error: s(out?.error || "unknown typing_on error"),
          status: Number(out?.status || 0),
        });
      }

      results.push({
        type,
        channel,
        ok: out.ok,
        status: out.status,
        error: out.error || null,
        meta,
        response: out.json || null,
      });
      continue;
    }

    if (type === "typing_off") {
      const out = await sendInstagramTypingOff({ recipientId });

      if (!out.ok) {
        logWarn("typing_off failed", {
          recipientId,
          error: s(out?.error || "unknown typing_off error"),
          status: Number(out?.status || 0),
        });
      }

      results.push({
        type,
        channel,
        ok: out.ok,
        status: out.status,
        error: out.error || null,
        meta,
        response: out.json || null,
      });
      continue;
    }

    if (type === "create_lead") {
      results.push(
        okResult({
          type,
          channel,
          meta: {
            ...(meta || {}),
            lead: action?.lead || null,
            note: "lead already persisted in AI HQ",
          },
        })
      );
      continue;
    }

    if (type === "handoff") {
      results.push(
        okResult({
          type,
          channel,
          meta: {
            ...(meta || {}),
            reason: s(action?.reason || "manual_review"),
            priority: s(action?.priority || "normal"),
            note: "handoff already persisted in AI HQ",
          },
        })
      );
      continue;
    }

    if (type === "no_reply") {
      results.push(
        okResult({
          type,
          channel,
          meta: {
            ...(meta || {}),
            reason: s(action?.reason || "rule_suppressed"),
          },
        })
      );
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