import { AIHQ_BASE_URL, AIHQ_INTERNAL_TOKEN, AIHQ_TIMEOUT_MS } from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return s(v).toLowerCase();
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

function buildUrl({ channel = "", recipientId = "", pageId = "", igUserId = "" }) {
  const base = trimSlash(AIHQ_BASE_URL);
  if (!base) return "";

  const safeChannel = lower(channel);
  const safeRecipientId = s(recipientId);
  const safePageId = s(pageId);
  const safeIgUserId = s(igUserId);

  const qs = new URLSearchParams();
  if (safeChannel) qs.set("channel", safeChannel);
  if (safeRecipientId) qs.set("recipientId", safeRecipientId);
  if (safePageId) qs.set("pageId", safePageId);
  if (safeIgUserId) qs.set("igUserId", safeIgUserId);

  if (![...qs.keys()].length) return "";

  return `${base}/api/tenants/resolve-channel?${qs.toString()}`;
}

function buildHeaders() {
  return {
    Accept: "application/json",
    ...(s(AIHQ_INTERNAL_TOKEN) ? { "x-internal-token": s(AIHQ_INTERNAL_TOKEN) } : {}),
  };
}

function logInfo(message, data = null) {
  try {
    if (data) console.log(`[meta-bot] ${message}`, data);
    else console.log(`[meta-bot] ${message}`);
  } catch {}
}

function logWarn(message, data = null) {
  try {
    if (data) console.warn(`[meta-bot] ${message}`, data);
    else console.warn(`[meta-bot] ${message}`);
  } catch {}
}

export async function resolveTenantContextFromMetaEvent({
  channel = "",
  recipientId = "",
  pageId = "",
  igUserId = "",
}) {
  const safeInput = {
    channel: lower(channel),
    recipientId: s(recipientId),
    pageId: s(pageId),
    igUserId: s(igUserId),
  };

  const base = trimSlash(AIHQ_BASE_URL);
  const url = buildUrl(safeInput);
  const timeoutMs = Number(AIHQ_TIMEOUT_MS || 20000);

  if (!base) {
    return {
      ok: false,
      status: 0,
      error: "AIHQ_BASE_URL missing",
      tenantKey: "",
      tenantId: "",
      tenant: null,
      channelConfig: null,
      resolvedChannel: safeInput.channel || "",
      input: safeInput,
    };
  }

  if (!url) {
    return {
      ok: false,
      status: 0,
      error: "tenant resolve input missing",
      tenantKey: "",
      tenantId: "",
      tenant: null,
      channelConfig: null,
      resolvedChannel: safeInput.channel || "",
      input: safeInput,
    };
  }

  logInfo("tenant resolve request", {
    base,
    url,
    timeoutMs,
    hasInternalToken: Boolean(s(AIHQ_INTERNAL_TOKEN)),
    input: safeInput,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startedAt = Date.now();

    const res = await fetch(url, {
      method: "GET",
      headers: buildHeaders(),
      signal: controller.signal,
    });

    const tookMs = Date.now() - startedAt;
    const json = await safeReadJson(res);

    logInfo("tenant resolve response", {
      status: res.status,
      tookMs,
      ok: res.ok,
      preview:
        json && typeof json === "object"
          ? JSON.stringify(json).slice(0, 300)
          : "",
    });

    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: json?.error || json?.message || "tenant resolve failed",
        tenantKey: "",
        tenantId: "",
        tenant: null,
        channelConfig: null,
        resolvedChannel: safeInput.channel || "",
        input: safeInput,
        json,
      };
    }

    return {
      ok: true,
      status: res.status,
      tenantKey: s(json?.tenantKey || json?.tenant?.tenant_key || ""),
      tenantId: s(json?.tenantId || json?.tenant?.id || ""),
      tenant: json?.tenant || null,
      channelConfig: json?.channelConfig || null,
      resolvedChannel: s(json?.resolvedChannel || safeInput.channel || ""),
      input: safeInput,
      json,
    };
  } catch (err) {
    const error =
      err?.name === "AbortError"
        ? "tenant resolve timeout"
        : String(err?.message || err);

    logWarn("tenant resolve fetch failed", {
      error,
      base,
      url,
      timeoutMs,
      hasInternalToken: Boolean(s(AIHQ_INTERNAL_TOKEN)),
      input: safeInput,
    });

    return {
      ok: false,
      status: 0,
      error,
      tenantKey: "",
      tenantId: "",
      tenant: null,
      channelConfig: null,
      resolvedChannel: safeInput.channel || "",
      input: safeInput,
    };
  } finally {
    clearTimeout(timer);
  }
}