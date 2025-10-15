import { AsyncLocalStorage } from "node:async_hooks";

/* Local structural AuthInfo type to avoid deep import path issues */
type AuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  extra?: Record<string, unknown>;
  
};

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import {
  HitlApiError,
  createHitlClient,
  type CancelRequestPayload,
  type CreateRequestPayload,
  type FeedbackPayload,
  type HitlApiEnvelope,
  type ListRequestsParams,
  type UpdateRequestPayload,
} from "@/lib/hitl-client";

const TOOL_METADATA = {
  list_loops: {
    description:
      "Retrieve all loops owned by the authenticated HITL.sh account.",
  },
  create_request: {
    description:
      "Create a new review request within a specific loop and broadcast it to reviewers.",
  },
  list_requests: {
    description:
      "List requests created by the authenticated API key with optional filters.",
  },
  get_request: {
    description:
      "Fetch detailed information about a single request by its identifier.",
  },
  update_request: {
    description:
      "Update mutable fields of a request, such as text, priority, or configuration.",
  },
  delete_request: {
    description:
      "Permanently delete a request. Only allowed for requests owned by the API key.",
  },
  cancel_request: {
    description:
      "Cancel a pending or claimed request so it stops processing.",
  },
  add_request_feedback: {
    description:
      "Attach structured feedback to a completed request to inform reviewers.",
  },
} satisfies Record<string, { description: string }>;

const USER_AGENT = "hitl-mcp-server/0.1.0";
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;

const authStorage = new AsyncLocalStorage<AuthInfo | undefined>();

type ToolExtra = {
  authInfo?: AuthInfo;
  requestInfo?: {
    headers?:
      | Headers
      | Record<string, string | string[] | undefined>
      | undefined;
  };
};

const createRequestFieldsSchema = z.object({
  processing_type: z.enum(["time-sensitive", "deferred"]),
  type: z.enum(["markdown", "image"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  request_text: z.string().min(1).max(2_000),
  timeout_seconds: z.number().int().positive().optional(),
  response_type: z.enum([
    "single_select",
    "multi_select",
    "rating",
    "text",
    "number",
  ]),
  response_config: z.record(z.unknown()),
  default_response: z.unknown().optional(),
  platform: z.string().default("api").optional(),
  image_url: z.string().url().optional(),
  context: z.record(z.unknown()).optional(),
  callback_url: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
});

const createRequestInputSchema = createRequestFieldsSchema
  .extend({
    loop_id: z.string().min(1, "Loop ID is required"),
  })
  .superRefine((value, ctx) => {
    if (
      value.processing_type === "time-sensitive" &&
      typeof value.timeout_seconds !== "number"
    ) {
      ctx.addIssue({
        path: ["timeout_seconds"],
        code: z.ZodIssueCode.custom,
        message:
          "timeout_seconds is required when processing_type is time-sensitive",
      });
    }
    if (value.type === "image" && !value.image_url) {
      ctx.addIssue({
        path: ["image_url"],
        code: z.ZodIssueCode.custom,
        message: "image_url is required when type is image",
      });
    }
  });

const listRequestsInputSchema = z.object({
  status: z.enum(["pending", "claimed", "completed", "timeout", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  loop_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z
    .enum(["created_at_desc", "created_at_asc", "priority_desc", "status_asc"])
    .optional(),
});

const requestIdSchema = z.object({
  request_id: z.string().min(1, "request_id is required"),
});

const updateRequestInputSchema = z.object({
  request_id: z.string().min(1, "request_id is required"),
  updates: createRequestFieldsSchema
    .partial()
    .refine(
      (value) => Object.keys(value).length > 0,
      "Provide at least one field to update",
    ),
});

const cancelRequestInputSchema = requestIdSchema.extend({
  reason: z.string().min(1).max(1_000).optional(),
});

const feedbackSchema = z
  .object({
    rating: z.number().min(1).max(5).optional(),
    comment: z.string().max(1_000).optional(),
    accuracy: z.number().min(1).max(5).optional(),
    timeliness: z.number().min(1).max(5).optional(),
    helpfulness: z.number().min(1).max(5).optional(),
    would_recommend: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    follow_up_needed: z.boolean().optional(),
    category: z.enum(["positive", "constructive", "issue"]).optional(),
  })
  .catchall(z.unknown())
  .refine(
    (value) => Object.keys(value).length > 0,
    "Feedback cannot be empty",
  );

const addFeedbackInputSchema = requestIdSchema.extend({
  feedback: feedbackSchema,
});

function parseBearer(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const [type, token] = value.trim().split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }
  return token;
}

function extractBearerFromHeaders(
  headers:
    | Headers
    | Record<string, string | string[] | undefined>
    | undefined,
): string | undefined {
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    const value =
      headers.get("authorization") ?? headers.get("Authorization") ?? undefined;
    return parseBearer(value);
  }

  const headerValue =
    (headers["authorization"] ??
      headers["Authorization"] ??
      headers["AUTHORIZATION"]) ?? undefined;

  if (Array.isArray(headerValue)) {
    return parseBearer(headerValue[0]);
  }

  return parseBearer(headerValue);
}

async function resolveAuthInfo(extra?: ToolExtra): Promise<AuthInfo> {
  const contextualAuth = authStorage.getStore();
  if (contextualAuth?.token) {
    return contextualAuth;
  }

  if (extra?.authInfo?.token) {
    return extra.authInfo;
  }

  const tokenFromHeaders = extractBearerFromHeaders(
    extra?.requestInfo?.headers,
  );

  if (!tokenFromHeaders) {
    throw new Error(
      "Authentication is required. Provide a valid HITL.sh API key.",
    );
  }

  const authInfo = await getAuthInfoForToken(tokenFromHeaders);
  if (!authInfo?.token) {
    throw new Error("Authentication failed. Verify the HITL.sh API key.");
  }

  return authInfo;
}

async function createClient(extra?: ToolExtra) {
  const authInfo = await resolveAuthInfo(extra);
  return {
    client: createHitlClient(authInfo.token, { userAgent: USER_AGENT }),
    authInfo,
  };
}

function normalizeEnvelope<T>(envelope: HitlApiEnvelope<T>) {
  if (envelope.error) {
    throw new Error(envelope.msg || "HITL API returned an error");
  }
  return envelope;
}

function formatContent(payload: unknown) {
  const resp = {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  } as const;
  // Cast to the generic MCP tool response shape expected by mcp-handler
  return resp as unknown as { [x: string]: unknown; content: unknown[] };
}

function normalizeError(error: unknown): Error {
  if (error instanceof HitlApiError) {
    return new Error(`${error.message} (status ${error.status})`);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unexpected error occurred");
}

const authCache = new Map<
  string,
  { authInfo: AuthInfo; expiresAt: number }
>();

// Zod raw shapes expected by mcp-handler
type ZRS = Record<string, z.ZodTypeAny>;
const listLoopsShape: ZRS = {};
const createRequestShape = {
  loop_id: z.string().min(1, "Loop ID is required"),
  processing_type: z.enum(["time-sensitive", "deferred"]),
  type: z.enum(["markdown", "image"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  request_text: z.string().min(1).max(2_000),
  timeout_seconds: z.number().int().positive().optional(),
  response_type: z.enum([
    "single_select",
    "multi_select",
    "rating",
    "text",
    "number",
  ]),
  response_config: z.record(z.unknown()),
  default_response: z.unknown().optional(),
  platform: z.string().optional(),
  image_url: z.string().url().optional(),
  context: z.record(z.unknown()).optional(),
  callback_url: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
} satisfies ZRS;

const listRequestsShape = {
  status: z.enum(["pending", "claimed", "completed", "timeout", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  loop_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.enum(["created_at_desc", "created_at_asc", "priority_desc", "status_asc"]).optional(),
} satisfies ZRS;

const requestIdShape = {
  request_id: z.string().min(1, "request_id is required"),
} satisfies ZRS;

const updateRequestShape = {
  request_id: z.string().min(1, "request_id is required"),
  updates: createRequestFieldsSchema.partial(),
} satisfies ZRS;

const cancelRequestShape = {
  request_id: z.string().min(1, "request_id is required"),
  reason: z.string().min(1).max(1_000).optional(),
} satisfies ZRS;

const addFeedbackShape = {
  request_id: z.string().min(1, "request_id is required"),
  feedback: feedbackSchema,
} satisfies ZRS;

const baseHandler = createMcpHandler(
  async (server) => {
    server.tool(
      "list_loops",
      TOOL_METADATA.list_loops.description,
      listLoopsShape,
      (async (_input: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const response = await client.getLoops();
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            loops: envelope.data.loops,
            count: envelope.data.count,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "create_request",
      TOOL_METADATA.create_request.description,
      createRequestShape,
      (async (input: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          // Re-validate with full schema to enforce superRefine rules
          const parsed = createRequestInputSchema.parse(input);
          const { loop_id, ...payload } = parsed as any;
          if (!payload.platform) {
            payload.platform = "api";
          }
          const response = await client.createRequest(
            loop_id,
            payload as CreateRequestPayload,
          );
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "list_requests",
      TOOL_METADATA.list_requests.description,
      listRequestsShape,
      (async (input: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const validated = listRequestsInputSchema.parse(input) as ListRequestsParams;
          const response = await client.listRequests(validated);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            summary: {
              count: envelope.data.count,
              total: envelope.data.total,
              has_more: envelope.data.has_more,
            },
            requests: envelope.data.requests,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "get_request",
      TOOL_METADATA.get_request.description,
      requestIdShape,
      (async ({ request_id }: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const response = await client.getRequest(request_id);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "update_request",
      TOOL_METADATA.update_request.description,
      updateRequestShape,
      (async ({ request_id, updates }: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const parsed = updateRequestInputSchema.parse({ request_id, updates });
          const response = await client.updateRequest(
            parsed.request_id,
            parsed.updates as UpdateRequestPayload,
          );
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "delete_request",
      TOOL_METADATA.delete_request.description,
      requestIdShape,
      (async ({ request_id }: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const response = await client.deleteRequest(request_id);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "cancel_request",
      TOOL_METADATA.cancel_request.description,
      cancelRequestShape,
      (async ({ request_id, reason }: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const payload: CancelRequestPayload | undefined = reason
            ? { reason }
            : undefined;
          const response = await client.cancelRequest(request_id, payload);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    server.tool(
      "add_request_feedback",
      TOOL_METADATA.add_request_feedback.description,
      addFeedbackShape,
      (async ({ request_id, feedback }: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const validated = addFeedbackInputSchema.parse({ request_id, feedback });
          const response = await client.addRequestFeedback(validated.request_id, {
            feedback: validated.feedback,
          } as FeedbackPayload);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );
  },
  {
    serverInfo: {
      name: "hitl-mcp-server",
      version: "0.1.0",
    },
    capabilities: {
      tools: Object.fromEntries(
        Object.entries(TOOL_METADATA).map(([name, meta]) => [
          name,
          { description: meta.description },
        ]),
      ),
    },
  },
  {
    basePath: "",
    verboseLogs: process.env.NODE_ENV !== "production",
    maxDuration: 90,
    disableSse: true,
  },
);

const handler = (req: Request) =>
  authStorage.run((req as { auth?: AuthInfo }).auth, () => baseHandler(req));

async function getAuthInfoForToken(
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const cached = authCache.get(bearerToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.authInfo;
  }

  try {
    const client = createHitlClient(bearerToken, { userAgent: USER_AGENT });
    const envelope = await client.validateApiKey();
    if (envelope.error) {
      return undefined;
    }

    const authInfo: AuthInfo = {
      token: bearerToken,
      clientId:
        envelope.data.user_id ??
        envelope.data.email ??
        envelope.data.api_key_id,
      scopes: envelope.data.permissions ?? [],
      extra: {
        email: envelope.data.email,
        apiKeyId: envelope.data.api_key_id,
        accountStatus: envelope.data.account_status,
      },
    };

    authCache.set(bearerToken, {
      authInfo,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });

    return authInfo;
  } catch (error) {
    if (error instanceof HitlApiError && error.status === 401) {
      return undefined;
    }
    console.error("Failed to validate HITL API key", error);
    return undefined;
  }
}

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  return getAuthInfoForToken(bearerToken);
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
