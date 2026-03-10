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

  const url = buildUrl(safeInput);

  if (!trimSlash(AIHQ_BASE_URL)) {
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

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(AIHQ_TIMEOUT_MS || 8000)
  );

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: buildHeaders(),
      signal: controller.signal,
    });

    const json = await safeReadJson(res);

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
    return {
      ok: false,
      status: 0,
      error:
        err?.name === "AbortError"
          ? "tenant resolve timeout"
          : String(err?.message || err),
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