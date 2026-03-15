import {
  sendInstagramTextMessage,
  sendInstagramSeen,
  sendInstagramTypingOn,
  sendInstagramTypingOff,
  sendInstagramCommentReply,
  sendInstagramPrivateCommentReply,
  sendFacebookCommentReply,
  sendFacebookPrivateCommentReply,
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

function failResult({
  type,
  channel,
  error,
  status = 0,
  meta = null,
  response = null,
}) {
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

function pickCommentId(action, ctx = {}) {
  return (
    s(action?.commentId) ||
    s(action?.externalCommentId) ||
    s(action?.meta?.externalCommentId) ||
    s(ctx?.commentId) ||
    s(ctx?.externalCommentId)
  );
}

function normalizeChannel(action, ctx = {}) {
  return lower(action?.channel || ctx?.channel || "instagram") || "instagram";
}

function pickTenantKey(action, ctx = {}) {
  const meta = isObject(action?.meta) ? action.meta : {};
  const ctxMeta = isObject(ctx?.meta) ? ctx.meta : {};

  return (
    lower(
      action?.tenantKey ||
        action?.tenant_key ||
        meta?.tenantKey ||
        meta?.tenant_key ||
        ctx?.tenantKey ||
        ctx?.tenant_key ||
        ctxMeta?.tenantKey ||
        ctxMeta?.tenant_key ||
        ""
    ) || "default"
  );
}

function pickTenantId(action, ctx = {}) {
  const meta = isObject(action?.meta) ? action.meta : {};
  const ctxMeta = isObject(ctx?.meta) ? ctx.meta : {};

  return (
    s(
      action?.tenantId ||
        action?.tenant_id ||
        meta?.tenantId ||
        meta?.tenant_id ||
        ctx?.tenantId ||
        ctx?.tenant_id ||
        ctxMeta?.tenantId ||
        ctxMeta?.tenant_id ||
        ""
    ) || ""
  );
}

function pickPageId(action, ctx = {}) {
  const meta = isObject(action?.meta) ? action.meta : {};
  const ctxMeta = isObject(ctx?.meta) ? ctx.meta : {};

  return s(
    action?.pageId ||
      action?.page_id ||
      meta?.pageId ||
      meta?.page_id ||
      ctx?.pageId ||
      ctx?.page_id ||
      ctxMeta?.pageId ||
      ctxMeta?.page_id ||
      ""
  );
}

function pickIgUserId(action, ctx = {}) {
  const meta = isObject(action?.meta) ? action.meta : {};
  const ctxMeta = isObject(ctx?.meta) ? ctx.meta : {};

  return s(
    action?.igUserId ||
      action?.ig_user_id ||
      meta?.igUserId ||
      meta?.ig_user_id ||
      meta?.instagramBusinessAccountId ||
      meta?.instagram_business_account_id ||
      ctx?.igUserId ||
      ctx?.ig_user_id ||
      ctxMeta?.igUserId ||
      ctxMeta?.ig_user_id ||
      ctxMeta?.instagramBusinessAccountId ||
      ctxMeta?.instagram_business_account_id ||
      ""
  );
}

function needsRecipient(type) {
  return ["send_message", "mark_seen", "send_seen", "typing_on", "typing_off"].includes(type);
}

function needsCommentId(type) {
  return ["reply_comment", "private_reply_comment"].includes(type);
}

function shouldSkipOutboundAck(action, ctx = {}) {
  const meta = isObject(action?.meta) ? action.meta : {};
  const ctxMeta = isObject(ctx?.meta) ? ctx.meta : {};

  return Boolean(
    meta?.skipOutboundAck ||
      meta?.internalOutbound ||
      meta?.alreadyTrackedInAiHq ||
      meta?.resendAttemptId ||
      ctxMeta?.skipOutboundAck ||
      ctxMeta?.internalOutbound ||
      ctxMeta?.alreadyTrackedInAiHq ||
      ctxMeta?.resendAttemptId
  );
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
      replyComment: sendInstagramCommentReply,
      privateReplyComment: sendInstagramPrivateCommentReply,
      supportsSeen: true,
      supportsTyping: true,
      supportsCommentReply: typeof sendInstagramCommentReply === "function",
      supportsPrivateCommentReply:
        typeof sendInstagramPrivateCommentReply === "function",
    };
  }

  if (ch === "facebook" || ch === "messenger") {
    return {
      supported: true,
      sendText: null,
      sendSeen: null,
      typingOn: null,
      typingOff: null,
      replyComment: sendFacebookCommentReply,
      privateReplyComment: sendFacebookPrivateCommentReply,
      supportsSeen: false,
      supportsTyping: false,
      supportsCommentReply: typeof sendFacebookCommentReply === "function",
      supportsPrivateCommentReply:
        typeof sendFacebookPrivateCommentReply === "function",
    };
  }

  return {
    supported: false,
    sendText: null,
    sendSeen: null,
    typingOn: null,
    typingOff: null,
    replyComment: null,
    privateReplyComment: null,
    supportsSeen: false,
    supportsTyping: false,
    supportsCommentReply: false,
    supportsPrivateCommentReply: false,
  };
}

async function ackOutboundToAiHq({ action, ctx, providerResponse }) {
  const meta = isObject(action?.meta) ? action.meta : {};
  const tenantKey = pickTenantKey(action, ctx);
  const tenantId = pickTenantId(action, ctx);

  const payload = {
    tenantKey,
    tenantId: tenantId || null,
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
      tenantKey,
      tenantId: tenantId || null,
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

  if (typeof sender !== "function") {
    return failResult({
      type: "send_message",
      channel,
      error: "send_message not supported for channel",
      meta,
    });
  }

  const tenantKey = pickTenantKey(action, ctx);
  const tenantId = pickTenantId(action, ctx) || null;
  const pageId = pickPageId(action, ctx);
  const igUserId = pickIgUserId(action, ctx);

  const out = await sender({
    recipientId,
    text,
    tenantKey,
    tenantId,
    pageId,
    igUserId,
    meta: meta || {},
  });

  let outboundAck = null;
  const skipAck = shouldSkipOutboundAck(action, ctx);

  if (out.ok) {
    if (!skipAck) {
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
          tenantKey,
        });
      } else {
        logWarn("outbound ack failed after successful send_message", {
          threadId: s(meta?.threadId || ctx?.threadId || ""),
          recipientId,
          tenantKey,
          error: s(outboundAck?.error || "unknown outbound ack error"),
          status: Number(outboundAck?.status || 0),
        });
      }
    } else {
      logInfo("outbound ack skipped (already tracked in AI HQ)", {
        threadId: s(meta?.threadId || ctx?.threadId || ""),
        tenantKey,
        resendAttemptId: s(meta?.resendAttemptId || ctx?.meta?.resendAttemptId || ""),
      });
    }
  } else {
    logWarn("send_message failed", {
      threadId: s(meta?.threadId || ctx?.threadId || ""),
      recipientId,
      tenantKey,
      pageId,
      igUserId,
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
      tenantKey,
      tenantId,
      pageId,
      igUserId,
      outboundAckSkipped: skipAck,
      outboundAck: outboundAck || null,
    },
    response: out.json || null,
  };
}

async function runReplyComment({
  action,
  ctx,
  channel,
  commentId,
  meta,
  sender,
  actionType = "reply_comment",
}) {
  const text = s(action?.text || action?.replyText);

  if (!text) {
    return failResult({
      type: actionType,
      channel,
      error: "reply text missing",
      meta,
    });
  }

  if (!commentId) {
    return failResult({
      type: actionType,
      channel,
      error: "commentId missing",
      meta,
    });
  }

  if (typeof sender !== "function") {
    return failResult({
      type: actionType,
      channel,
      error:
        actionType === "private_reply_comment"
          ? "private comment reply not supported for channel"
          : "comment reply not supported for channel",
      meta,
    });
  }

  const tenantKey = pickTenantKey(action, ctx);
  const tenantId = pickTenantId(action, ctx) || null;
  const pageId = pickPageId(action, ctx);
  const igUserId = pickIgUserId(action, ctx);

  const out = await sender({
    commentId,
    text,
    tenantKey,
    tenantId,
    pageId,
    igUserId,
    meta: meta || {},
  });

  if (!out.ok) {
    logWarn(`${actionType} failed`, {
      channel,
      commentId,
      tenantKey,
      pageId,
      igUserId,
      error: s(out?.error || `unknown ${actionType} error`),
      status: Number(out?.status || 0),
    });
  } else {
    logInfo(`${actionType} success`, {
      channel,
      commentId,
      tenantKey,
      providerReplyId: s(
        out?.json?.id ||
          out?.json?.comment_id ||
          out?.json?.reply_id ||
          out?.json?.message_id ||
          ""
      ),
    });
  }

  return {
    type: actionType,
    channel,
    ok: Boolean(out.ok),
    status: Number(out.status || 0),
    error: out.error || null,
    meta: {
      ...(meta || {}),
      tenantKey,
      tenantId,
      pageId,
      igUserId,
      externalCommentId: commentId,
      privateReply: actionType === "private_reply_comment",
    },
    response: out.json || null,
  };
}

async function runSeen({ type, action, ctx, channel, recipientId, meta, sender }) {
  const tenantKey = pickTenantKey(action, ctx);
  const tenantId = pickTenantId(action, ctx) || null;
  const pageId = pickPageId(action, ctx);
  const igUserId = pickIgUserId(action, ctx);

  const out = await sender({
    recipientId,
    tenantKey,
    tenantId,
    pageId,
    igUserId,
    meta: meta || {},
  });

  if (!out.ok) {
    logWarn("mark_seen failed", {
      recipientId,
      tenantKey,
      pageId,
      igUserId,
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
    meta: {
      ...(meta || {}),
      tenantKey,
      tenantId,
      pageId,
      igUserId,
    },
    response: out.json || null,
  };
}

async function runTyping({ type, action, ctx, channel, recipientId, meta, sender, logLabel }) {
  const tenantKey = pickTenantKey(action, ctx);
  const tenantId = pickTenantId(action, ctx) || null;
  const pageId = pickPageId(action, ctx);
  const igUserId = pickIgUserId(action, ctx);

  const out = await sender({
    recipientId,
    tenantKey,
    tenantId,
    pageId,
    igUserId,
    meta: meta || {},
  });

  if (!out.ok) {
    logWarn(`${logLabel} failed`, {
      recipientId,
      tenantKey,
      pageId,
      igUserId,
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
    meta: {
      ...(meta || {}),
      tenantKey,
      tenantId,
      pageId,
      igUserId,
    },
    response: out.json || null,
  };
}

function buildPassiveSuccess(type, channel, action, meta, ctx = {}) {
  const tenantKey = pickTenantKey(action, ctx);
  const tenantId = pickTenantId(action, ctx) || null;

  if (type === "create_lead") {
    return okResult({
      type,
      channel,
      meta: {
        ...(meta || {}),
        tenantKey,
        tenantId,
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
        tenantKey,
        tenantId,
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
        tenantKey,
        tenantId,
        reason: s(action?.reason || "rule_suppressed"),
      },
    });
  }

  if (type === "comment_saved") {
    return okResult({
      type,
      channel,
      meta: {
        ...(meta || {}),
        tenantKey,
        tenantId,
        note: "comment action already persisted in AI HQ",
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
    const commentId = pickCommentId(action, ctx);
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

    if (needsCommentId(type) && !commentId) {
      results.push(
        failResult({
          type,
          channel,
          error: "commentId missing",
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

    if (type === "reply_comment") {
      if (!caps.supportsCommentReply || !caps.replyComment) {
        results.push(
          failResult({
            type,
            channel,
            error: "comment reply not supported for channel",
            meta,
          })
        );
        continue;
      }

      results.push(
        await runReplyComment({
          action,
          ctx,
          channel,
          commentId,
          meta,
          sender: caps.replyComment,
          actionType: "reply_comment",
        })
      );
      continue;
    }

    if (type === "private_reply_comment") {
      if (!caps.supportsPrivateCommentReply || !caps.privateReplyComment) {
        results.push(
          failResult({
            type,
            channel,
            error: "private comment reply not supported for channel",
            meta,
          })
        );
        continue;
      }

      results.push(
        await runReplyComment({
          action,
          ctx,
          channel,
          commentId,
          meta,
          sender: caps.privateReplyComment,
          actionType: "private_reply_comment",
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
          action,
          ctx,
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
          action,
          ctx,
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
          action,
          ctx,
          channel,
          recipientId,
          meta,
          sender: caps.typingOff,
          logLabel: "typing_off",
        })
      );
      continue;
    }

    const passive = buildPassiveSuccess(type, channel, action, meta, ctx);
    if (passive) {
      results.push(passive);
      continue;
    }

    logWarn("unsupported action", {
      type: type || "unknown",
      channel: channel || "unknown",
      tenantKey: pickTenantKey(action, ctx),
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