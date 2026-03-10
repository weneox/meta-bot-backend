import { AIHQ_BASE_URL, AIHQ_INTERNAL_TOKEN, AIHQ_TIMEOUT_MS } from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

function trimSlash(x) {
  return s(x).replace(/\/+$/, "");
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function safeReadJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json",
    ...(s(AIHQ_INTERNAL_TOKEN) ? { "x-internal-token": s(AIHQ_INTERNAL_TOKEN) } : {}),
  };
}

function normalizePayload(payload) {
  if (!isObject(payload)) return {};

  return {
    ...payload,
    tenantKey: s(payload.tenantKey || payload.tenant_key || ""),
    tenantId: s(payload.tenantId || payload.tenant_id || "") || null,
  };
}

async function postToAiHq(path, payload) {
  const base = trimSlash(AIHQ_BASE_URL);

  if (!base) {
    return {
      ok: false,
      status: 0,
      error: "AIHQ_BASE_URL missing",
      json: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(AIHQ_TIMEOUT_MS || 8000)
  );

  try {
    const safePayload = normalizePayload(payload);

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(safePayload),
      signal: controller.signal,
    });

    const json = await safeReadJson(res);

    return {
      ok: res.ok && json?.ok !== false,
      status: res.status,
      json,
      error: res.ok
        ? null
        : json?.error || json?.message || "AI HQ request failed",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: null,
      error:
        err?.name === "AbortError"
          ? "AI HQ timeout"
          : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardToAiHq(payload) {
  return postToAiHq("/api/inbox/ingest", payload);
}

export async function forwardCommentToAiHq(payload) {
  return postToAiHq("/api/comments/ingest", payload);
}