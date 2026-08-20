import { AsyncLocalStorage } from "node:async_hooks";

/* Local structural AuthInfo type to avoid deep import path issues */
type AuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
  claims?: Record<string, unknown>;
  subject?: string;
  extra?: Record<string, unknown>;
};

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import {
  HitlApiError,
  createHitlClient,
  type CreateRequestPayload,
  type FeedbackPayload,
  type HitlApiEnvelope,
  type ListRequestsParams,
  type UpdateRequestPayload,
} from "@/lib/hitl-client";
import { verifyAuth0Token } from "@/lib/auth0-verify";

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
  cancel_request: {
    description:
      "Cancel a pending or claimed request by deleting it. This sets the request status to 'cancelled'.",
  },
  add_request_feedback: {
    description:
      "Attach structured feedback to a completed request to inform reviewers.",
  },
  list_images: {
    description:
      "List all images in the user's mobile image library with their numbers. Use these numbers with get_image to fetch a specific image.",
  },
  get_image: {
    description:
      "Get a specific image from the user's mobile library by its number. Returns the image so you can see it directly.",
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
  type: z.enum(["markdown", "image", "file", "video", "audio"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  request_text: z.string().min(1).max(2_000),
  timeout_seconds: z.number().int().positive().optional(),
  response_type: z.enum([
    "single_select",
    "multi_select",
    "rating",
    "text",
    "number",
    "boolean",
    "editable_text",
  ]),
  response_config: z.record(z.unknown()),
  default_response: z.unknown(),
  platform: z.string().default("api").optional(),
  image_url: z.string().url().optional(),
  file_url: z.string().url().optional(),
  file_type: z.string().optional(),
  file_name: z.string().optional(),
  video_url: z.string().url().optional(),
  audio_url: z.string().url().optional(),
  image_urls: z.array(z.string().url()).optional(),
  file_urls: z.array(z.string().url()).optional(),
  file_types: z.array(z.string()).optional(),
  file_names: z.array(z.string()).optional(),
  video_urls: z.array(z.string().url()).optional(),
  audio_urls: z.array(z.string().url()).optional(),
  assignee_role: z.enum(["any", "manager", "admin"]).optional(),
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
    if (value.type === "file" && !value.file_url) {
      ctx.addIssue({
        path: ["file_url"],
        code: z.ZodIssueCode.custom,
        message: "file_url is required when type is file",
      });
    }
    if (value.type === "video" && !value.video_url) {
      ctx.addIssue({
        path: ["video_url"],
        code: z.ZodIssueCode.custom,
        message: "video_url is required when type is video",
      });
    }
    if (value.type === "audio" && !value.audio_url) {
      ctx.addIssue({
        path: ["audio_url"],
        code: z.ZodIssueCode.custom,
        message: "audio_url is required when type is audio",
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
  // Try to get HITL API key from user's OAuth claims first (per-user key)
  // Check both namespaced and non-namespaced claims
  let hitlApiKey =
    (extra?.authInfo?.claims?.['https://mcp.hitl.sh/hitl_api_key'] as string | undefined) ||
    (extra?.authInfo?.claims?.hitl_api_key as string | undefined);

  if (!hitlApiKey) {
    // No personal key - check for shared fallback
    hitlApiKey = process.env.HITL_API_KEY;

    if (!hitlApiKey) {
      // NO KEY AT ALL - show helpful error with setup instructions
      throw new Error(
        "⚠️ HITL API Key Required\n\n" +
        "Please add your HITL.sh API key to use this service:\n\n" +
        "1. Visit: https://mcp.hitl.sh/setup-api-key\n" +
        "2. Log in with your ChatGPT credentials\n" +
        "3. Enter your HITL API key\n" +
        "4. Reconnect in ChatGPT\n\n" +
        "Get your API key at: https://my.hitl.sh/dashboard"
      );
    }

    // Using shared fallback key
    console.log("Using shared HITL_API_KEY from environment (user has no personal key)");
  } else {
    // Using user's personal key
    console.log("Using user's personal HITL API key from OAuth claims");
  }

  return {
    client: createHitlClient(hitlApiKey, { userAgent: USER_AGENT }),
    authInfo: extra?.authInfo,
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
  type: z.enum(["markdown", "image", "file", "video", "audio"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  request_text: z.string().min(1).max(2_000),
  timeout_seconds: z.number().int().positive().optional(),
  response_type: z.enum([
    "single_select",
    "multi_select",
    "rating",
    "text",
    "number",
    "boolean",
    "editable_text",
  ]),
  response_config: z.record(z.unknown()),
  default_response: z.unknown(),
  platform: z.string().optional(),
  image_url: z.string().url().optional(),
  file_url: z.string().url().optional(),
  file_type: z.string().optional(),
  file_name: z.string().optional(),
  video_url: z.string().url().optional(),
  audio_url: z.string().url().optional(),
  image_urls: z.array(z.string().url()).optional(),
  file_urls: z.array(z.string().url()).optional(),
  file_types: z.array(z.string()).optional(),
  file_names: z.array(z.string()).optional(),
  video_urls: z.array(z.string().url()).optional(),
  audio_urls: z.array(z.string().url()).optional(),
  assignee_role: z.enum(["any", "manager", "admin"]).optional(),
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
} satisfies ZRS;

const addFeedbackShape = {
  request_id: z.string().min(1, "request_id is required"),
  feedback: feedbackSchema,
} satisfies ZRS;

const baseHandler = createMcpHandler(
  async (server) => {
    server.tool(
      "list_loops",
      listLoopsShape,
      { description: TOOL_METADATA.list_loops.description },
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
      createRequestShape,
      { description: TOOL_METADATA.create_request.description },
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
      listRequestsShape,
      { description: TOOL_METADATA.list_requests.description },
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
      requestIdShape,
      { description: TOOL_METADATA.get_request.description },
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
      updateRequestShape,
      { description: TOOL_METADATA.update_request.description },
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
      "cancel_request",
      cancelRequestShape,
      { description: TOOL_METADATA.cancel_request.description },
      (async ({ request_id }: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const response = await client.cancelRequest(request_id);
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
      addFeedbackShape,
      { description: TOOL_METADATA.add_request_feedback.description },
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

    // --- Image capture tools ---

    const listImagesShape = {
      limit: z.number().int().min(1).max(50).optional().describe("Max images to return (default 20)"),
    };

    server.tool(
      "list_images",
      listImagesShape,
      { description: TOOL_METADATA.list_images.description },
      (async (input: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const limit = input.limit ?? 20;
          const response = await client.listCaptures(limit);
          const envelope = normalizeEnvelope(response);
          const captures = envelope.data?.captures ?? [];
          return formatContent({
            message: envelope.msg,
            images: captures.map((c: any) => ({
              number: c.number,
              label: c.label || null,
              source: c.source,
              mime_type: c.mime_type,
              image_url: c.image_url,
              captured_at: c.created_at,
            })),
            count: captures.length,
            total: envelope.data?.pagination?.total ?? captures.length,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      }) as any,
    );

    const getImageShape = {
      number: z.number().int().min(1).describe("The image number to retrieve (e.g. 1, 2, 3)"),
    };

    server.tool(
      "get_image",
      getImageShape,
      { description: TOOL_METADATA.get_image.description },
      (async (input: any, extra: any) => {
        try {
          const { client } = await createClient(extra);
          const response = await client.getCaptureByNumber(input.number);
          const envelope = normalizeEnvelope(response);
          const capture = envelope.data;

          if (!capture || !capture.image_url) {
            return formatContent({
              message: `Image ${input.number} not found. Use list_images to see available images.`,
            });
          }

          // Fetch the image and return as base64
          try {
            const imageResponse = await fetch(capture.image_url);
            if (!imageResponse.ok) {
              return formatContent({
                message: `Image ${input.number} found but could not be downloaded.`,
                image_url: capture.image_url,
                metadata: { number: capture.number, label: capture.label, source: capture.source, captured_at: capture.created_at },
              });
            }

            const arrayBuffer = await imageResponse.arrayBuffer();
            const sizeBytes = arrayBuffer.byteLength;

            // Skip base64 for images > 4MB
            if (sizeBytes > 4 * 1024 * 1024) {
              return formatContent({
                message: `Image ${input.number} is too large to embed (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Use the URL directly.`,
                image_url: capture.image_url,
                metadata: { number: capture.number, label: capture.label, source: capture.source, captured_at: capture.created_at },
              });
            }

            const base64Data = Buffer.from(arrayBuffer).toString("base64");
            const mimeType = capture.mime_type || "image/png";

            return {
              content: [
                {
                  type: "image" as const,
                  data: base64Data,
                  mimeType,
                },
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    image_number: capture.number,
                    label: capture.label || null,
                    source: capture.source,
                    captured_at: capture.created_at,
                  }, null, 2),
                },
              ],
            } as unknown as { [x: string]: unknown; content: unknown[] };
          } catch {
            // Fallback: return URL if fetch fails
            return formatContent({
              message: `Image ${input.number} found. Could not fetch binary — use URL directly.`,
              image_url: capture.image_url,
              metadata: { number: capture.number, label: capture.label, source: capture.source, captured_at: capture.created_at },
            });
          }
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

// Use Auth0 OAuth verification for authentication
const authHandler = withMcpAuth(handler, verifyAuth0Token, {
  required: true,  // OAuth authentication is required
  // Optional: specify required scopes
  // requiredScopes: ["read:loops", "write:requests"],
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
