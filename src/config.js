import "dotenv/config";

function s(v, fallback = "") {
  const out = String(v ?? fallback).trim();
  return out;
}

function n(v, fallback) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export const PORT = n(process.env.PORT, 8080);

export const VERIFY_TOKEN = s(
  process.env.VERIFY_TOKEN,
  "neox_verify_token"
);

export const N8N_WEBHOOK_URL = s(process.env.N8N_WEBHOOK_URL);
export const N8N_TIMEOUT_MS = n(process.env.N8N_TIMEOUT_MS, 8000);

export const CONTACT_EMAIL = s(
  process.env.CONTACT_EMAIL,
  "weneox@gmail.com"
);

export const PUBLIC_BASE_URL = s(process.env.PUBLIC_BASE_URL).replace(/\/+$/, "");

// AI HQ bridge
export const AIHQ_BASE_URL = s(process.env.AIHQ_BASE_URL).replace(/\/+$/, "");
export const AIHQ_INTERNAL_TOKEN = s(process.env.AIHQ_INTERNAL_TOKEN);
export const AIHQ_TIMEOUT_MS = n(process.env.AIHQ_TIMEOUT_MS, 8000);

// Meta send
export const META_PAGE_ACCESS_TOKEN = s(process.env.META_PAGE_ACCESS_TOKEN);
export const META_API_VERSION = s(process.env.META_API_VERSION, "v23.0");
export const META_REPLY_TIMEOUT_MS = n(process.env.META_REPLY_TIMEOUT_MS, 8000);