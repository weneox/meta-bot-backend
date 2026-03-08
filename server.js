import "dotenv/config";
import express from "express";

import { PORT } from "./src/config.js";
import { registerPublicPages } from "./src/routes/publicPages.js";
import { registerWebhookRoutes } from "./src/routes/webhook.js";

const app = express();

app.disable("x-powered-by");

app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.status(200).send("Meta Bot Backend is working");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "meta-bot-backend",
  });
});

registerPublicPages(app);
registerWebhookRoutes(app);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
  });
});

app.use((err, req, res, next) => {
  try {
    console.error("[meta-bot] unhandled error", {
      message: String(err?.message || err),
    });
  } catch {}

  if (res.headersSent) return next(err);

  return res.status(500).json({
    ok: false,
    error: "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log("[meta-bot] listening on", PORT);
  console.log("[meta-bot] HEALTH:", "/health");
  console.log("[meta-bot] PRIVACY:", "/privacy");
  console.log("[meta-bot] TERMS:", "/terms");
  console.log("[meta-bot] WEBHOOK:", "/webhook");
});