// src/routes/webhook.js
import { VERIFY_TOKEN } from "../config.js";
import { pickFirstTextEvent } from "../utils/metaParser.js";
import { forwardToN8n } from "../services/n8nClient.js";

export function registerWebhookRoutes(app) {
  // Meta verify (Webhook Verification)
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

  // Meta events
  app.post("/webhook", async (req, res) => {
    // Meta retry etməsin deyə ASAP 200
    res.sendStatus(200);

    try {
      const ev = pickFirstTextEvent(req.body);
      if (!ev?.text) return;

      const payload = {
        source: "meta",
        channel: ev.channel,
        userId: ev.userId,
        text: ev.text,
        timestamp: ev.timestamp,
      };

      const out = await forwardToN8n(payload);

      console.log("[meta-bot] forwarded to n8n:", {
        ok: out.ok,
        status: out.status,
        error: out.error,
        preview: (out.json ?? out.text ?? "").toString().slice(0, 160),
      });

      // Sonrakı addım: out.json.replyText varsa Graph API ilə cavab göndərmək.
    } catch (err) {
      console.error("[meta-bot] Error:", err);
    }
  });
}