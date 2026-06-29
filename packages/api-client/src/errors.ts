// RFC 7807 Problem Details parsing
import { z } from 'zod';

export const ProblemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  correlationId: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
    public correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function fromProblemDetails(body: ProblemDetails): ApiError {
  const parsed = ProblemDetailsSchema.parse(body);
  const err = new ApiError(parsed.detail ?? parsed.title, parsed.status, parsed.instance ?? '');
  err.correlationId = parsed.correlationId;
  return err;
}
