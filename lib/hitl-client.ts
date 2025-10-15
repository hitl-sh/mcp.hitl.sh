/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lightweight HITL.sh API client used by the MCP server tools.
 *
 * The client focuses on the subset of endpoints required to support
 * the tools described in PLAN.txt.
 */

export interface HitlClientOptions {
  /**
   * Base URL for the HITL API. Defaults to https://api.hitl.sh/v1.
   *
   * The client will append endpoint paths relative to this base.
   */
  baseUrl?: string;
  /**
   * Optional fetch implementation (useful for testing).
   */
  fetchImpl?: typeof fetch;
  /**
   * Optional user agent to send with requests.
   */
  userAgent?: string;
}

export interface HitlApiEnvelope<T = any> {
  error: boolean;
  msg: string;
  data: T;
}

export interface HitlLoop {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  creator_id?: string;
}

export interface HitlLoopListResponse {
  loops: HitlLoop[];
  count: number;
}

export type HitlProcessingType = "time-sensitive" | "deferred";
export type HitlRequestType = "markdown" | "image";
export type HitlRequestPriority = "low" | "medium" | "high" | "critical";
export type HitlResponseType =
  | "single_select"
  | "multi_select"
  | "rating"
  | "text"
  | "number";

export interface CreateRequestPayload {
  processing_type: HitlProcessingType;
  type: HitlRequestType;
  priority: HitlRequestPriority;
  request_text: string;
  timeout_seconds?: number;
  response_type: HitlResponseType;
  response_config: Record<string, unknown>;
  default_response?: unknown;
  platform?: string;
  image_url?: string;
  context?: Record<string, unknown>;
  callback_url?: string;
  tags?: string[];
}

export interface UpdateRequestPayload extends Partial<CreateRequestPayload> {
  status?: string;
  request_text?: string;
}

export interface ListRequestsParams {
  status?: "pending" | "claimed" | "completed" | "timeout" | "cancelled";
  priority?: HitlRequestPriority;
  loop_id?: string;
  limit?: number;
  offset?: number;
  sort?:
    | "created_at_desc"
    | "created_at_asc"
    | "priority_desc"
    | "status_asc";
}

export interface CancelRequestPayload {
  reason?: string;
}

export interface FeedbackPayload {
  feedback: Record<string, unknown>;
}

export interface HitlRequestSummary {
  id: string;
  loop_id: string;
  processing_type: HitlProcessingType;
  type: HitlRequestType;
  priority: HitlRequestPriority;
  request_text: string;
  status: string;
  response_type: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface HitlRequestListResponse {
  requests: HitlRequestSummary[];
  count: number;
  total?: number;
  has_more?: boolean;
  pagination?: Record<string, unknown>;
}

export interface TestApiKeyResponse {
  api_key_id: string;
  user_id: string;
  email: string;
  account_status: string;
  rate_limit?: Record<string, unknown>;
  permissions?: string[];
}

export class HitlApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HitlApiError";
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_BASE_URL = ensureTrailingSlash(
  process.env.HITL_API_BASE ?? "https://api.hitl.sh/v1"
);

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function stripLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

export class HitlClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent?: string;

  constructor(
    private readonly apiKey: string,
    options: HitlClientOptions = {}
  ) {
    if (!apiKey) {
      throw new Error("A HITL API key is required to create a client");
    }

    this.baseUrl = ensureTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent;
  }

  async validateApiKey(): Promise<HitlApiEnvelope<TestApiKeyResponse>> {
    return this.request<HitlApiEnvelope<TestApiKeyResponse>>("test", {
      method: "GET",
    });
  }

  async getLoops(): Promise<HitlApiEnvelope<HitlLoopListResponse>> {
    return this.request<HitlApiEnvelope<HitlLoopListResponse>>("api/loops", {
      method: "GET",
    });
  }

  async createRequest(
    loopId: string,
    payload: CreateRequestPayload
  ): Promise<HitlApiEnvelope<Record<string, unknown>>> {
    return this.request<HitlApiEnvelope<Record<string, unknown>>>(
      `api/loops/${loopId}/requests`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  async listRequests(
    params: ListRequestsParams = {}
  ): Promise<HitlApiEnvelope<HitlRequestListResponse>> {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.priority) search.set("priority", params.priority);
    if (params.loop_id) search.set("loop_id", params.loop_id);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    if (params.sort) search.set("sort", params.sort);

    const path =
      search.size > 0
        ? `api/requests?${search.toString()}`
        : "api/requests";

    return this.request<HitlApiEnvelope<HitlRequestListResponse>>(path, {
      method: "GET",
    });
  }

  async getRequest(
    requestId: string
  ): Promise<HitlApiEnvelope<Record<string, unknown>>> {
    return this.request<HitlApiEnvelope<Record<string, unknown>>>(
      `api/requests/${requestId}`,
      {
        method: "GET",
      }
    );
  }

  async updateRequest(
    requestId: string,
    payload: UpdateRequestPayload
  ): Promise<HitlApiEnvelope<Record<string, unknown>>> {
    return this.request<HitlApiEnvelope<Record<string, unknown>>>(
      `api/requests/${requestId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
  }

  async deleteRequest(
    requestId: string
  ): Promise<HitlApiEnvelope<Record<string, unknown>>> {
    return this.request<HitlApiEnvelope<Record<string, unknown>>>(
      `api/requests/${requestId}`,
      {
        method: "DELETE",
      }
    );
  }

  async cancelRequest(
    requestId: string,
    payload: CancelRequestPayload = {}
  ): Promise<HitlApiEnvelope<Record<string, unknown>>> {
    return this.request<HitlApiEnvelope<Record<string, unknown>>>(
      `api/requests/${requestId}/cancel`,
      {
        method: "POST",
        body:
          payload && Object.keys(payload).length > 0
            ? JSON.stringify(payload)
            : undefined,
      }
    );
  }

  async addRequestFeedback(
    requestId: string,
    payload: FeedbackPayload
  ): Promise<HitlApiEnvelope<Record<string, unknown>>> {
    return this.request<HitlApiEnvelope<Record<string, unknown>>>(
      `api/requests/${requestId}/feedback`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit & { body?: BodyInit | null }
  ): Promise<T> {
    const url = new URL(stripLeadingSlash(path), this.baseUrl).toString();
    const headers = new Headers(init.headers);

    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Accept", "application/json");
    if (init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (this.userAgent) {
      headers.set("User-Agent", this.userAgent);
    }

    const response = await this.fetchImpl(url, {
      ...init,
      headers,
    });

    const contentType = response.headers.get("content-type");
    let body: unknown = undefined;

    if (contentType?.includes("application/json")) {
      body = await response.json();
    } else {
      const text = await response.text();
      body = text ? { raw: text } : undefined;
    }

    if (!response.ok) {
      const message =
        (body as { msg?: string })?.msg ??
        `HITL API request failed with status ${response.status}`;
      throw new HitlApiError(message, response.status, body);
    }

    return body as T;
  }
}

export function createHitlClient(
  apiKey: string,
  options?: HitlClientOptions
): HitlClient {
  return new HitlClient(apiKey, options);
}

