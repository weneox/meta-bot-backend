import express from "express";
import { executeMetaActions } from "../services/actionExecutor.js";
import { AIHQ_INTERNAL_TOKEN } from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

function requireInternalToken(req) {
  const token = s(req.headers["x-internal-token"] || "");
  const expected = s(AIHQ_INTERNAL_TOKEN || "");
  return Boolean(token && expected && token === expected);
}

export function internalOutboundRoutes() {
  const r = express.Router();

  r.post("/internal/outbound/send", async (req, res) => {
    if (!requireInternalToken(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const tenantKey = s(req.body?.tenantKey || "neox") || "neox";
    const channel = s(req.body?.channel || "instagram").toLowerCase() || "instagram";
    const threadId = s(req.body?.threadId || "");
    const recipientId = s(req.body?.recipientId || "");
    const text = s(req.body?.text || "");
    const senderType = s(req.body?.senderType || "ai").toLowerCase() || "ai";
    const messageType = s(req.body?.messageType || "text").toLowerCase() || "text";
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};

    if (!recipientId) {
      return res.status(400).json({ ok: false, error: "recipientId required" });
    }

    if (!text && attachments.length === 0) {
      return res.status(400).json({ ok: false, error: "text or attachments required" });
    }

    try {
      const { ok, results } = await executeMetaActions(
        [
          {
            type: "send_message",
            channel,
            recipientId,
            text,
            attachments,
            meta: {
              ...meta,
              tenantKey,
              threadId,
              senderType,
              messageType,
              skipOutboundAck: true,
              internalOutbound: true,
              alreadyTrackedInAiHq: true,
            },
          },
        ],
        {
          tenantKey,
          channel,
          threadId,
          recipientId,
          userId: recipientId,
          meta: {
            ...meta,
            skipOutboundAck: true,
            internalOutbound: true,
            alreadyTrackedInAiHq: true,
          },
        }
      );

      const result = Array.isArray(results) ? results[0] || null : null;

      return res.status(ok ? 200 : 502).json({
        ok,
        result,
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: String(e?.message || e),
      });
    }
  });

  return r;
}