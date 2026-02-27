// src/config.js
import "dotenv/config";

export const PORT = Number(process.env.PORT || "8080") || 8080;

export const VERIFY_TOKEN = String(process.env.VERIFY_TOKEN || "neox_verify_token").trim();

export const N8N_WEBHOOK_URL = String(process.env.N8N_WEBHOOK_URL || "").trim();
export const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || "8000") || 8000;

export const CONTACT_EMAIL = String(process.env.CONTACT_EMAIL || "weneox@gmail.com").trim();

export const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");