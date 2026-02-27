// src/utils/http.js
import { PUBLIC_BASE_URL } from "../config.js";

export function safeStr(x) {
  return typeof x === "string" ? x : "";
}

// Proxy arxasında düzgün baseUrl (Railway üçün)
export function getBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;

  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https")
    .toString()
    .split(",")[0]
    .trim();

  const host = (req.headers["x-forwarded-host"] || req.headers.host || "")
    .toString()
    .split(",")[0]
    .trim();

  return host ? `${proto}://${host}` : "";
}