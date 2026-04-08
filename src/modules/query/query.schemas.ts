import { z } from "zod";

export const querySuccessStatuses = ["success", "partial", "no_results"] as const;
export const queryErrorStatuses = ["validation_error", "system_error"] as const;
export const queryResultStatuses = [...querySuccessStatuses, ...queryErrorStatuses] as const;

const nullableTrimmedStringSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

export const queryRequestBodySchema = z
  .object({
    query: z.string().trim().min(1, "query is required").max(4000, "query is too long"),
    jurisdiction: nullableTrimmedStringSchema,
    userId: nullableTrimmedStringSchema,
    saveQuery: z.boolean().optional().default(false)
  })
  .strict();

export const queryAnswerSectionSchema = z.object({
  sectionTitle: z.string().trim().min(1),
  content: z.string().trim().min(1)
});

export const queryAnswerSchema = z.object({
  summary: z.string().trim().min(1),
  body: z.array(queryAnswerSectionSchema),
  limitations: z.string().trim().min(1).optional()
});

export const queryCitationSchema = z.object({
  sourceName: z.string().trim().min(1),
  documentTitle: z.string().trim().min(1),
  publishedAt: z.string().trim().min(1).nullable(),
  sourceType: z.string().trim().min(1).nullable(),
  url: z.string().trim().min(1).nullable()
});

export const querySuccessResponseSchema = z.object({
  resultStatus: z.enum(querySuccessStatuses),
  queryId: z.string().uuid(),
  jurisdiction: z.string().trim().min(1).nullable(),
  answer: queryAnswerSchema,
  citations: z.array(queryCitationSchema),
  sourcesUsed: z.number().int().nonnegative()
});

export const queryErrorResponseSchema = z.object({
  resultStatus: z.enum(queryErrorStatuses),
  queryId: z.string().uuid().nullable(),
  jurisdiction: z.string().trim().min(1).nullable(),
  answer: queryAnswerSchema,
  citations: z.array(queryCitationSchema),
  sourcesUsed: z.literal(0),
  error: z.object({
    code: z.enum(queryErrorStatuses),
    message: z.string().trim().min(1),
    details: z.array(z.string().trim().min(1)).optional()
  })
});

export const queryResponseSchema = z.union([querySuccessResponseSchema, queryErrorResponseSchema]);

export const querySchemas = {
  requestBody: queryRequestBodySchema,
  responseBody: queryResponseSchema
};
