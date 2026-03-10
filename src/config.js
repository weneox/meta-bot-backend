import "dotenv/config";

function s(v, fallback = "") {
  return String(v ?? fallback).trim();
}

function n(v, fallback) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function b(v, fallback = false) {
  const x = String(v ?? "").trim().toLowerCase();
  if (!x) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(x)) return true;
  if (["0", "false", "no", "n", "off"].includes(x)) return false;
  return fallback;
}

export const PORT = n(process.env.PORT, 8080);

export const VERIFY_TOKEN = s(process.env.VERIFY_TOKEN, "neox_verify_token");

export const CONTACT_EMAIL = s(process.env.CONTACT_EMAIL, "weneox@gmail.com");
export const PUBLIC_BASE_URL = s(process.env.PUBLIC_BASE_URL, "").replace(/\/+$/, "");

// --------------------------------------------------
// AI HQ bridge
// --------------------------------------------------
export const AIHQ_BASE_URL = s(process.env.AIHQ_BASE_URL, "").replace(/\/+$/, "");
export const AIHQ_INTERNAL_TOKEN = s(process.env.AIHQ_INTERNAL_TOKEN, "");
export const AIHQ_TIMEOUT_MS = n(process.env.AIHQ_TIMEOUT_MS, 8000);
export const AIHQ_SECRETS_PATH = s(
  process.env.AIHQ_SECRETS_PATH,
  "/api/settings/secrets"
);

// --------------------------------------------------
// Meta send
// fallback env token only for temporary / legacy support
// real production path should be tenant secrets from AI HQ
// --------------------------------------------------
export const META_PAGE_ACCESS_TOKEN = s(process.env.META_PAGE_ACCESS_TOKEN, "");
export const META_API_VERSION = s(process.env.META_API_VERSION, "v23.0");
export const META_REPLY_TIMEOUT_MS = n(process.env.META_REPLY_TIMEOUT_MS, 8000);
export const META_TOKEN_FALLBACK_ENABLED = b(
  process.env.META_TOKEN_FALLBACK_ENABLED,
  true
);

// --------------------------------------------------
// optional logs
// --------------------------------------------------
export const LOG_WEBHOOK_EVENTS = b(process.env.LOG_WEBHOOK_EVENTS, true);
export const LOG_WEBHOOK_IGNORED = b(process.env.LOG_WEBHOOK_IGNORED, true);
export const LOG_ACTION_RESULTS = b(process.env.LOG_ACTION_RESULTS, true);

// --------------------------------------------------
// legacy / optional
// --------------------------------------------------
export const N8N_WEBHOOK_URL = s(process.env.N8N_WEBHOOK_URL, "");
export const N8N_TIMEOUT_MS = n(process.env.N8N_TIMEOUT_MS, 8000);