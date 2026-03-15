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

function arr(v) {
  return Array.isArray(v) ? v : [];
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

function normalizeUser(obj) {
  if (!isObject(obj)) return {};

  return {
    userId: s(obj.userId || obj.user_id || obj.id || ""),
    username: s(obj.username || obj.handle || ""),
    fullName: s(obj.fullName || obj.full_name || obj.name || ""),
    firstName: s(obj.firstName || obj.first_name || ""),
    lastName: s(obj.lastName || obj.last_name || ""),
    phone: s(obj.phone || obj.phoneNumber || obj.phone_number || ""),
    email: s(obj.email || ""),
    language: s(obj.language || obj.lang || ""),
    city: s(obj.city || ""),
    country: s(obj.country || ""),
  };
}

function normalizeCustomerContext(v) {
  if (!isObject(v)) return {};

  return {
    fullName: s(v.fullName || v.full_name || v.name || ""),
    firstName: s(v.firstName || v.first_name || ""),
    lastName: s(v.lastName || v.last_name || ""),
    username: s(v.username || ""),
    phone: s(v.phone || v.phoneNumber || v.phone_number || ""),
    email: s(v.email || ""),
    industry: s(v.industry || v.niche || ""),
    businessType: s(v.businessType || v.business_type || ""),
    companyName: s(v.companyName || v.company_name || ""),
    city: s(v.city || ""),
    country: s(v.country || ""),
    budgetRange: s(v.budgetRange || v.budget_range || ""),
    interestedService: s(v.interestedService || v.interested_service || v.service || ""),
    preferredLanguage: s(v.preferredLanguage || v.preferred_language || v.language || ""),
    notes: s(v.notes || v.note || ""),
    tags: arr(v.tags).map((x) => s(x)).filter(Boolean),
    extra: isObject(v.extra) ? v.extra : {},
  };
}

function normalizeLeadContext(v) {
  if (!isObject(v)) return {};

  return {
    source: s(v.source || ""),
    stage: s(v.stage || ""),
    status: s(v.status || ""),
    interestLevel: s(v.interestLevel || v.interest_level || ""),
    leadScore:
      Number.isFinite(Number(v.leadScore ?? v.lead_score))
        ? Number(v.leadScore ?? v.lead_score)
        : null,
    budgetRange: s(v.budgetRange || v.budget_range || ""),
    desiredService: s(v.desiredService || v.desired_service || ""),
    notes: s(v.notes || ""),
  };
}

function normalizeFormData(v) {
  if (!isObject(v)) return {};
  return v;
}

function normalizeTenantContext(v) {
  if (!isObject(v)) return {};

  return {
    tenantKey: s(v.tenantKey || v.tenant_key || ""),
    companyName: s(v.companyName || v.company_name || ""),
    industryKey: s(v.industryKey || v.industry_key || ""),
    defaultLanguage: s(v.defaultLanguage || v.default_language || ""),
    enabledLanguages: arr(v.enabledLanguages || v.enabled_languages)
      .map((x) => s(x))
      .filter(Boolean),
    tone: s(v.tone || ""),
    services: arr(v.services).map((x) => s(x)).filter(Boolean),
    contact: isObject(v.contact) ? v.contact : {},
    aiPolicy: isObject(v.aiPolicy || v.ai_policy) ? (v.aiPolicy || v.ai_policy) : {},
    extra: isObject(v.extra) ? v.extra : {},
  };
}

function normalizeConversationContext(v) {
  if (!isObject(v)) return {};

  return {
    threadExternalId: s(v.threadExternalId || v.thread_external_id || ""),
    parentMessageId: s(v.parentMessageId || v.parent_message_id || ""),
    channel: s(v.channel || ""),
    platform: s(v.platform || ""),
    recentMessages: arr(v.recentMessages || v.recent_messages)
      .filter(isObject)
      .map((m) => ({
        role: s(m.role || m.senderRole || m.sender_role || ""),
        text: s(m.text || m.message || ""),
        timestamp: s(m.timestamp || m.createdAt || m.created_at || ""),
      })),
    labels: arr(v.labels).map((x) => s(x)).filter(Boolean),
    extra: isObject(v.extra) ? v.extra : {},
  };
}

function normalizeMessage(v) {
  if (!isObject(v)) return {};

  return {
    id: s(v.id || v.messageId || v.message_id || ""),
    text: s(v.text || v.body || v.message || ""),
    timestamp: s(v.timestamp || v.createdAt || v.created_at || ""),
    attachments: arr(v.attachments),
    raw: isObject(v.raw) ? v.raw : {},
  };
}

function normalizeMeta(v) {
  if (!isObject(v)) return {};

  return {
    platform: s(v.platform || ""),
    pageId: s(v.pageId || v.page_id || ""),
    pageName: s(v.pageName || v.page_name || ""),
    igBusinessAccountId: s(v.igBusinessAccountId || v.ig_business_account_id || ""),
    commentId: s(v.commentId || v.comment_id || ""),
    postId: s(v.postId || v.post_id || ""),
    mediaId: s(v.mediaId || v.media_id || ""),
    eventType: s(v.eventType || v.event_type || ""),
    extra: isObject(v.extra) ? v.extra : {},
  };
}

function normalizePayload(payload) {
  if (!isObject(payload)) return {};

  const tenantKey = s(payload.tenantKey || payload.tenant_key || "");
  const tenantId = s(payload.tenantId || payload.tenant_id || "") || null;

  return {
    ...payload,

    tenantKey,
    tenantId,

    channel: s(payload.channel || payload.platform || ""),
    platform: s(payload.platform || payload.channel || ""),

    threadExternalId: s(payload.threadExternalId || payload.thread_external_id || ""),
    messageExternalId: s(payload.messageExternalId || payload.message_external_id || ""),
    parentMessageId: s(payload.parentMessageId || payload.parent_message_id || ""),

    from: normalizeUser(payload.from),
    to: normalizeUser(payload.to),

    message: normalizeMessage(payload.message),
    customerContext: normalizeCustomerContext(
      payload.customerContext || payload.customer_context
    ),
    leadContext: normalizeLeadContext(payload.leadContext || payload.lead_context),
    formData: normalizeFormData(payload.formData || payload.form_data),
    tenantContext: normalizeTenantContext(
      payload.tenantContext || payload.tenant_context
    ),
    conversationContext: normalizeConversationContext(
      payload.conversationContext || payload.conversation_context
    ),
    meta: normalizeMeta(payload.meta),

    tags: arr(payload.tags).map((x) => s(x)).filter(Boolean),
    receivedAt: s(payload.receivedAt || payload.received_at || ""),
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