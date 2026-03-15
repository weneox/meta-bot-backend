import { AIHQ_BASE_URL, AIHQ_INTERNAL_TOKEN, AIHQ_TIMEOUT_MS } from "../config.js";

function s(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return s(v).toLowerCase();
}

function trimSlash(v) {
  return s(v).replace(/\/+$/, "");
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
    Accept: "application/json",
    ...(s(AIHQ_INTERNAL_TOKEN)
      ? { "x-internal-token": s(AIHQ_INTERNAL_TOKEN) }
      : {}),
  };
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const x = s(v);
    if (x) return x;
  }
  return "";
}

function normalizeSecretRows(json) {
  if (Array.isArray(json?.secrets)) return json.secrets;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.rows)) return json.rows;
  return [];
}

function pickSecretValue(rows, ...keys) {
  const wanted = keys.map((k) => lower(k)).filter(Boolean);

  for (const row of Array.isArray(rows) ? rows : []) {
    const secretKey = lower(
      row?.secret_key || row?.key || row?.name || row?.slug || ""
    );

    if (!wanted.includes(secretKey)) continue;

    const val = firstNonEmpty(
      row?.value,
      row?.secret_value,
      row?.decrypted_value,
      row?.plain_value
    );

    if (val) return val;
  }

  return "";
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

async function resolveMetaChannelConfig({
  channel = "instagram",
  recipientId = "",
  pageId = "",
  igUserId = "",
}) {
  const base = trimSlash(AIHQ_BASE_URL);

  if (!base) {
    return {
      ok: false,
      status: 0,
      error: "AIHQ_BASE_URL missing",
      tenantKey: "",
      tenant: null,
      channelConfig: null,
      json: null,
    };
  }

  const safeChannel = lower(channel || "instagram");
  const safeRecipientId = s(recipientId);
  const safePageId = s(pageId);
  const safeIgUserId = s(igUserId);

  if (!safeRecipientId && !safePageId && !safeIgUserId) {
    return {
      ok: false,
      status: 0,
      error: "recipientId or pageId or igUserId is required",
      tenantKey: "",
      tenant: null,
      channelConfig: null,
      json: null,
    };
  }

  const qs = new URLSearchParams();
  qs.set("channel", safeChannel);
  if (safeRecipientId) qs.set("recipientId", safeRecipientId);
  if (safePageId) qs.set("pageId", safePageId);
  if (safeIgUserId) qs.set("igUserId", safeIgUserId);

  const url = `${base}/api/tenants/resolve-channel?${qs.toString()}`;
  const timeoutMs = Number(AIHQ_TIMEOUT_MS || 20000);

  logInfo("tenant secret resolve request", {
    base,
    url,
    timeoutMs,
    hasInternalToken: Boolean(s(AIHQ_INTERNAL_TOKEN)),
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

    logInfo("tenant secret resolve response", {
      status: res.status,
      ok: res.ok,
      tookMs,
      preview:
        json && typeof json === "object"
          ? JSON.stringify(json).slice(0, 500)
          : "",
      secretKeys: Array.isArray(json?.secrets)
        ? json.secrets.map((x) => x?.secret_key || x?.key || "")
        : [],
    });

    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        status: res.status,
        error:
          json?.error ||
          json?.message ||
          `resolve-channel failed (${res.status})`,
        tenantKey: "",
        tenant: null,
        channelConfig: null,
        json,
      };
    }

    return {
      ok: true,
      status: res.status,
      error: null,
      tenantKey: lower(json?.tenantKey || json?.tenant?.tenant_key || ""),
      tenant: json?.tenant || null,
      channelConfig: json?.channelConfig || null,
      json,
    };
  } catch (err) {
    const error =
      err?.name === "AbortError"
        ? "resolve-channel timeout"
        : String(err?.message || err);

    logWarn("tenant secret resolve failed", {
      error,
      base,
      url,
      timeoutMs,
      hasInternalToken: Boolean(s(AIHQ_INTERNAL_TOKEN)),
    });

    return {
      ok: false,
      status: 0,
      error,
      tenantKey: "",
      tenant: null,
      channelConfig: null,
      json: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mapResolveOutput(out) {
  const cfg =
    out?.channelConfig && typeof out.channelConfig === "object"
      ? out.channelConfig
      : {};

  const meta = cfg?.meta && typeof cfg.meta === "object" ? cfg.meta : {};
  const secrets = normalizeSecretRows(out?.json);

  const pageAccessToken = firstNonEmpty(
    cfg?.pageAccessToken,
    cfg?.page_access_token,
    meta?.pageAccessToken,
    meta?.page_access_token,
    pickSecretValue(
      secrets,
      "page_access_token",
      "access_token",
      "meta_page_access_token",
      "instagram_page_access_token"
    )
  );

  const pageId = firstNonEmpty(
    cfg?.pageId,
    cfg?.page_id,
    meta?.pageId,
    meta?.page_id,
    cfg?.external_page_id,
    pickSecretValue(secrets, "page_id", "meta_page_id", "instagram_page_id")
  );

  const igUserId = firstNonEmpty(
    cfg?.igUserId,
    cfg?.ig_user_id,
    cfg?.instagramBusinessAccountId,
    cfg?.instagram_business_account_id,
    cfg?.external_user_id,
    meta?.igUserId,
    meta?.ig_user_id,
    meta?.instagramBusinessAccountId,
    meta?.instagram_business_account_id,
    pickSecretValue(
      secrets,
      "ig_user_id",
      "instagram_business_account_id",
      "instagram_user_id"
    )
  );

  const appSecret = firstNonEmpty(
    cfg?.appSecret,
    cfg?.app_secret,
    meta?.appSecret,
    meta?.app_secret,
    pickSecretValue(secrets, "app_secret", "meta_app_secret")
  );

  const error = out?.ok
    ? pageAccessToken
      ? null
      : "tenant meta token not found in resolve-channel response"
    : out?.error || null;

  logInfo("resolved tenant meta config", {
    tenantKey: out?.tenantKey || "",
    hasPageAccessToken: Boolean(pageAccessToken),
    pageId,
    igUserId,
    secretKeys: secrets.map((x) => x?.secret_key || x?.key || ""),
    error,
    status: Number(out?.status || 0),
  });

  return {
    tenantKey: out?.tenantKey || "",
    pageAccessToken,
    pageId,
    igUserId,
    appSecret,
    source: out?.ok ? "resolve_channel" : "none",
    error,
    status: Number(out?.status || 0),
    channelConfig: cfg || null,
    tenant: out?.tenant || null,
  };
}

export async function getTenantMetaConfigByChannel({
  channel = "instagram",
  recipientId = "",
  pageId = "",
  igUserId = "",
}) {
  const out = await resolveMetaChannelConfig({
    channel,
    recipientId,
    pageId,
    igUserId,
  });

  return mapResolveOutput(out);
}

export async function getTenantMetaConfig(tenantKeyOrInput) {
  if (
    tenantKeyOrInput &&
    typeof tenantKeyOrInput === "object" &&
    !Array.isArray(tenantKeyOrInput)
  ) {
    return getTenantMetaConfigByChannel(tenantKeyOrInput);
  }

  const tenantKey = lower(tenantKeyOrInput);

  return {
    tenantKey,
    pageAccessToken: "",
    pageId: "",
    igUserId: "",
    appSecret: "",
    source: "none",
    error: tenantKey
      ? "tenantKey-only resolve is no longer supported here; use channel ids"
      : "tenantKey missing",
    status: 0,
    channelConfig: null,
    tenant: null,
  };
}