import { VERIFY_TOKEN } from "../config.js";
import { pickFirstTextEvent } from "../utils/metaParser.js";
import { forwardToAiHq } from "../services/aihqClient.js";
import { executeMetaActions } from "../services/actionExecutor.js";

function s(v) {
  return String(v ?? "").trim();
}

function summarizeExec(exec) {
  const results = Array.isArray(exec?.results) ? exec.results : [];

  return {
    total: results.length,
    ok: results.filter((x) => x?.ok).length,
    failed: results.filter((x) => !x?.ok).length,
    types: results.map((x) => ({
      type: s(x?.type || "unknown"),
      ok: Boolean(x?.ok),
      status: Number(x?.status || 0),
      error: s(x?.error || ""),
      outboundAckOk:
        x?.meta?.outboundAck && typeof x.meta.outboundAck === "object"
          ? Boolean(x.meta.outboundAck.ok)
          : null,
      outboundAckError:
        x?.meta?.outboundAck && typeof x.meta.outboundAck === "object"
          ? s(x.meta.outboundAck.error || "")
          : "",
    })),
  };
}

export function registerWebhookRoutes(app) {
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[meta-bot] Webhook verified");
      return res.status(200).send(String(challenge || ""));
    }

    return res.sendStatus(403);
  });

  app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    try {
      const ev = pickFirstTextEvent(req.body);

      if (!ev?.text) {
        console.log("[meta-bot] ignored event: no text");
        return;
      }

      const channel = s(ev.channel || "instagram").toLowerCase() || "instagram";
      const externalUserId = s(ev.userId || "");
      const externalMessageId = s(ev.messageId || ev.mid || "");

      if (!externalUserId) {
        console.log("[meta-bot] ignored event: missing userId");
        return;
      }

      const payload = {
        tenantKey: "neox",
        source: "meta",
        platform: channel,
        channel,
        userId: externalUserId,
        externalUserId,
        externalThreadId: externalUserId,
        externalMessageId,
        externalUsername: s(ev.username || ""),
        customerName: s(ev.customerName || ""),
        text: s(ev.text),
        timestamp: ev.timestamp || Date.now(),
        raw: req.body,
      };

      console.log("[meta-bot] inbound event:", {
        channel,
        userId: externalUserId,
        externalMessageId,
        textPreview: s(ev.text).slice(0, 160),
      });

      const out = await forwardToAiHq(payload);

      console.log("[meta-bot] forwarded to AI HQ:", {
        ok: out.ok,
        status: out.status,
        error: out.error,
        duplicate: Boolean(out?.json?.duplicate),
        deduped: Boolean(out?.json?.deduped),
        intent: s(out?.json?.intent || ""),
        leadScore: Number(out?.json?.leadScore || 0),
        actionsCount: Array.isArray(out?.json?.actions) ? out.json.actions.length : 0,
        threadId: s(out?.json?.thread?.id || ""),
        preview: JSON.stringify(out.json || {}).slice(0, 220),
      });

      if (!out.ok) return;

      const actions = Array.isArray(out?.json?.actions) ? out.json.actions : [];

      if (!actions.length) {
        console.log("[meta-bot] no actions returned from AI HQ", {
          duplicate: Boolean(out?.json?.duplicate),
          deduped: Boolean(out?.json?.deduped),
          intent: s(out?.json?.intent || ""),
        });
        return;
      }

      const exec = await executeMetaActions(actions, {
        channel,
        userId: externalUserId,
        recipientId: externalUserId,
        tenantKey: s(out?.json?.tenant?.tenant_key || "neox"),
        threadId: s(out?.json?.thread?.id || ""),
      });

      console.log("[meta-bot] action execution summary:", summarizeExec(exec));
    } catch (err) {
      console.error("[meta-bot] Error:", err);
    }
  });
}