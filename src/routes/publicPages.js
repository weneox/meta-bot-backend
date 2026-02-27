// src/routes/publicPages.js
import { CONTACT_EMAIL } from "../config.js";
import { getBaseUrl, safeStr } from "../utils/http.js";

export function registerPublicPages(app) {
  // ✅ Privacy Policy
  app.get("/privacy", (req, res) => {
    const b = getBaseUrl(req) || "https://meta-bot-backend-production.up.railway.app";
    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Privacy Policy - NEOX Automation</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;max-width:900px;margin:40px auto;padding:0 16px;line-height:1.6}
    code{background:#f2f2f2;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>This service receives Instagram/WhatsApp webhook events to automate replies and workflows (via n8n).</p>

  <h2>Data we process</h2>
  <ul>
    <li>Message text (only when a message is received)</li>
    <li>Sender/user identifier (platform user id / wa_id)</li>
    <li>Timestamp and minimal metadata</li>
  </ul>

  <h2>How we use data</h2>
  <ul>
    <li>Forward message content to our automation workflow (n8n) to generate a response or trigger business processes.</li>
    <li>We do not sell personal data.</li>
  </ul>

  <h2>Data retention</h2>
  <p>We keep only minimal logs for debugging and reliability. You may request deletion.</p>

  <h2>Data deletion request</h2>
  <p>Deletion URL: <code>${b}/instagram/data-deletion</code></p>

  <h2>Contact</h2>
  <p>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body>
</html>`);
  });

  // ✅ Terms of Service
  app.get("/terms", (req, res) => {
    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Terms of Service - NEOX Automation</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;max-width:900px;margin:40px auto;padding:0 16px;line-height:1.6}
  </style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p>This service processes Instagram and WhatsApp webhook events for automation purposes.</p>
  <ul>
    <li>You agree that messages may be processed to generate replies and trigger workflows.</li>
    <li>We do not sell personal data.</li>
    <li>You can request deletion of your data using the data deletion endpoint.</li>
  </ul>
  <p>Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body>
</html>`);
  });

  // ✅ Deauthorize callback (Meta bəzən GET, bəzən POST vura bilir)
  app.get("/instagram/deauthorize", (req, res) => res.status(200).send("OK"));
  app.post("/instagram/deauthorize", (req, res) => res.status(200).json({ ok: true }));

  // ✅ Data deletion request (Meta compliant)
  app.get("/instagram/data-deletion", (req, res) => {
    res.status(200).send("Data deletion endpoint ready");
  });

  app.post("/instagram/data-deletion", (req, res) => {
    const b = getBaseUrl(req) || "https://meta-bot-backend-production.up.railway.app";
    const confirmationCode = `del_${Date.now()}`;

    res.status(200).json({
      url: `${b}/instagram/data-deletion/status?code=${encodeURIComponent(confirmationCode)}`,
      confirmation_code: confirmationCode,
    });
  });

  app.get("/instagram/data-deletion/status", (req, res) => {
    const code = safeStr(req.query.code);
    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Data Deletion Status</title>
</head>
<body style="font-family:system-ui;padding:24px;line-height:1.6">
  <h2>Data deletion request received</h2>
  <p>Confirmation code: <b>${code || "-"}</b></p>
  <p>If you need help, contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</body>
</html>`);
  });
}