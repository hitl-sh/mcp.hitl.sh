import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
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

type ToolExtra = {
  authInfo?: AuthInfo;
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

function ensureAuthenticated(extra: ToolExtra): AuthInfo {
  const authInfo = extra.authInfo;
  if (!authInfo?.token) {
    throw new Error(
      "Authentication is required. Provide a valid HITL.sh API key.",
    );
  }
  return authInfo;
}

function createClient(extra: ToolExtra) {
  const authInfo = ensureAuthenticated(extra);
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
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
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

const handler = createMcpHandler(
  async (server) => {
    server.tool(
      "list_loops",
      TOOL_METADATA.list_loops.description,
      z.object({}).strict(),
      async (_input, extra) => {
        try {
          const { client } = createClient(extra);
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
      },
    );

    server.tool(
      "create_request",
      TOOL_METADATA.create_request.description,
      createRequestInputSchema,
      async (input, extra) => {
        try {
          const { client } = createClient(extra);
          const { loop_id, ...payload } = input;
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
      },
    );

    server.tool(
      "list_requests",
      TOOL_METADATA.list_requests.description,
      listRequestsInputSchema,
      async (input, extra) => {
        try {
          const { client } = createClient(extra);
          const response = await client.listRequests(
            input as ListRequestsParams,
          );
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
      },
    );

    server.tool(
      "get_request",
      TOOL_METADATA.get_request.description,
      requestIdSchema,
      async ({ request_id }, extra) => {
        try {
          const { client } = createClient(extra);
          const response = await client.getRequest(request_id);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      },
    );

    server.tool(
      "update_request",
      TOOL_METADATA.update_request.description,
      updateRequestInputSchema,
      async ({ request_id, updates }, extra) => {
        try {
          const { client } = createClient(extra);
          const response = await client.updateRequest(
            request_id,
            updates as UpdateRequestPayload,
          );
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      },
    );

    server.tool(
      "delete_request",
      TOOL_METADATA.delete_request.description,
      requestIdSchema,
      async ({ request_id }, extra) => {
        try {
          const { client } = createClient(extra);
          const response = await client.deleteRequest(request_id);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      },
    );

    server.tool(
      "cancel_request",
      TOOL_METADATA.cancel_request.description,
      cancelRequestInputSchema,
      async ({ request_id, reason }, extra) => {
        try {
          const { client } = createClient(extra);
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
      },
    );

    server.tool(
      "add_request_feedback",
      TOOL_METADATA.add_request_feedback.description,
      addFeedbackInputSchema,
      async ({ request_id, feedback }, extra) => {
        try {
          const { client } = createClient(extra);
          const response = await client.addRequestFeedback(request_id, {
            feedback,
          } as FeedbackPayload);
          const envelope = normalizeEnvelope(response);
          return formatContent({
            message: envelope.msg,
            data: envelope.data,
          });
        } catch (error) {
          throw normalizeError(error);
        }
      },
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

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) {
    return undefined;
  }

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
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
