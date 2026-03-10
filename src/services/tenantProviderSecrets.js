import {
  AIHQ_BASE_URL,
  AIHQ_INTERNAL_TOKEN,
  AIHQ_TIMEOUT_MS,
  AIHQ_SECRETS_PATH,
} from "../config.js";

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

function buildSecretsUrl(provider, tenantKey) {
  const base = trimSlash(AIHQ_BASE_URL);
  const path = s(AIHQ_SECRETS_PATH || "/api/settings/secrets");
  const safeProvider = encodeURIComponent(lower(provider));
  const safeTenantKey = encodeURIComponent(lower(tenantKey));

  if (!base) return "";

  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${safePath}?provider=${safeProvider}&tenantKey=${safeTenantKey}`;
}

async function fetchTenantSecrets(provider, tenantKey) {
  const url = buildSecretsUrl(provider, tenantKey);

  if (!url) {
    return {
      ok: false,
      error: "AIHQ_BASE_URL missing",
      secrets: [],
      status: 0,
      json: null,
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
      headers: {
        Accept: "application/json",
        ...(s(AIHQ_INTERNAL_TOKEN)
          ? { "x-internal-token": s(AIHQ_INTERNAL_TOKEN) }
          : {}),
      },
      signal: controller.signal,
    });

    const json = await safeReadJson(res);

    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        error:
          json?.error ||
          json?.message ||
          `AI HQ secrets fetch failed (${res.status})`,
        secrets: [],
        status: res.status,
        json,
      };
    }

    return {
      ok: true,
      error: null,
      secrets: Array.isArray(json?.secrets) ? json.secrets : [],
      status: res.status,
      json,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "AI HQ secrets timeout"
          : String(err?.message || err),
      secrets: [],
      status: 0,
      json: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function pickSecretValue(rows, key) {
  const wanted = lower(key);

  for (const row of Array.isArray(rows) ? rows : []) {
    const secretKey = lower(row?.secret_key || row?.key || "");
    if (secretKey === wanted) {
      return s(row?.value || "");
    }
  }

  return "";
}

export async function getTenantMetaConfig(tenantKey) {
  const safeTenantKey = lower(tenantKey);

  if (!safeTenantKey) {
    return {
      tenantKey: "",
      pageAccessToken: "",
      pageId: "",
      igUserId: "",
      appSecret: "",
      source: "none",
      error: "tenantKey missing",
      status: 0,
    };
  }

  const out = await fetchTenantSecrets("meta", safeTenantKey);
  const rows = Array.isArray(out?.secrets) ? out.secrets : [];

  return {
    tenantKey: safeTenantKey,
    pageAccessToken: pickSecretValue(rows, "page_access_token"),
    pageId: pickSecretValue(rows, "page_id"),
    igUserId: pickSecretValue(rows, "ig_user_id"),
    appSecret: pickSecretValue(rows, "app_secret"),
    source: out?.ok ? "aihq" : "none",
    error: out?.ok ? null : out?.error || null,
    status: Number(out?.status || 0),
  };
}