import express from "express";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "neox_verify_token";

// n8n webhook url (özününkünü yaz)
const N8N_WEBHOOK_URL = "https://YOUR-N8N-URL/webhook/neox-ig";

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.entry) {
      for (const entry of body.entry) {
        const event = entry.messaging?.[0];

        if (event?.message?.text) {
          const payload = {
            userId: event.sender.id,
            text: event.message.text,
            timestamp: event.timestamp
          };

          await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error:", err);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("Backend is working");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Listening on", PORT));