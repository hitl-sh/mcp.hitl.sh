import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
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
} satisfies Record<string, { description: string }>;

const USER_AGENT = "hitl-mcp-server-simple/0.1.0";

// AsyncLocalStorage to pass Request through tool handlers
const requestStorage = new AsyncLocalStorage<Request>();

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
  default_response: z.unknown(),
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
  default_response: z.unknown(),
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
} satisfies ZRS;

const addFeedbackShape = {
  request_id: z.string().min(1, "request_id is required"),
  feedback: feedbackSchema,
} satisfies ZRS;

// Custom auth function that validates HITL API key from Bearer token
async function validateApiKeyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error(
      "⚠️ HITL API Key Required\n\n" +
      "Please provide your HITL.sh API key in the Authorization header:\n" +
      "Authorization: Bearer hitl_live_your_api_key\n\n" +
      "Get your API key at: https://my.hitl.sh/dashboard"
    );
  }

  const apiKey = authHeader.replace('Bearer ', '').trim();

  // Validate API key format
  if (!apiKey.startsWith('hitl_live_') && !apiKey.startsWith('hitl_test_')) {
    throw new Error(
      "⚠️ Invalid HITL API Key Format\n\n" +
      "API key must start with 'hitl_live_' or 'hitl_test_'\n\n" +
      "Get your API key at: https://my.hitl.sh/dashboard"
    );
  }

  return apiKey;
}

async function createClient(req: Request) {
  const hitlApiKey = await validateApiKeyAuth(req);
  console.log("Using HITL API key from Bearer token (simple auth)");

  return {
    client: createHitlClient(hitlApiKey, { userAgent: USER_AGENT }),
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

// Create the handler - wrapping to inject req into extra
const baseHandler = createMcpHandler(
  async (server) => {
    server.tool(
      "list_loops",
      listLoopsShape,
      { description: TOOL_METADATA.list_loops.description },
      (async (_input: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      (async (input: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      (async (input: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      (async ({ request_id }: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      (async ({ request_id, updates }: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      (async ({ request_id }: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      (async ({ request_id, feedback }: any, _extra: any) => {
        try {
          const req = requestStorage.getStore();
          if (!req) throw new Error("Request object not available");

          const { client } = await createClient(req);
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
      name: "hitl-simple",
      version: "1.0.0",
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

// Wrapper to inject Request into AsyncLocalStorage
const handler = (req: Request) =>
  requestStorage.run(req, () => baseHandler(req));

export { handler as GET, handler as POST, handler as DELETE };
