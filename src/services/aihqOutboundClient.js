import { AIHQ_BASE_URL, AIHQ_INTERNAL_TOKEN, AIHQ_TIMEOUT_MS } from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

function trimSlash(x) {
  return s(x).replace(/\/+$/, "");
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

export async function notifyAiHqOutbound(payload) {
  const base = trimSlash(AIHQ_BASE_URL);

  if (!base) {
    return {
      ok: false,
      status: 0,
      error: "AIHQ_BASE_URL missing",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AIHQ_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/api/inbox/outbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        ...(AIHQ_INTERNAL_TOKEN ? { "x-internal-token": AIHQ_INTERNAL_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = await safeReadJson(res);

    return {
      ok: res.ok && json?.ok !== false,
      status: res.status,
      json,
      error: res.ok
        ? null
        : json?.error || json?.message || "AI HQ outbound notify failed",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error:
        err?.name === "AbortError"
          ? "AI HQ outbound timeout"
          : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}