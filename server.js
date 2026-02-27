// server.js — meta-bot-backend (modular boot)
import "dotenv/config";
import express from "express";

import { PORT } from "./src/config.js";
import { registerPublicPages } from "./src/routes/publicPages.js";
import { registerWebhookRoutes } from "./src/routes/webhook.js";

const app = express();

// JSON body
app.use(express.json({ limit: "2mb" }));

// Health
app.get("/", (req, res) => {
  res.status(200).send("Meta Bot Backend is working");
});

// Routes
registerPublicPages(app);
registerWebhookRoutes(app);

app.listen(PORT, () => {
  console.log("[meta-bot] listening on", PORT);
  console.log("[meta-bot] PRIVACY:", "/privacy");
  console.log("[meta-bot] TERMS:", "/terms");
  console.log("[meta-bot] WEBHOOK:", "/webhook");
});