import { Prisma } from "@/lib/generated/prisma/client";

// PostgreSQL error codes raised by the constraints in the init migration.
export const PG_EXCLUSION_VIOLATION = "23P01";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function serverErrorResponse(error: unknown) {
  console.error(error);
  return errorResponse("Something went wrong. Please try again.", 500);
}

// Returns the parsed body when it is a JSON object, otherwise null.
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Constraint failures that Prisma has no dedicated code for surface as P2039 with
// the original PostgreSQL error code attached by the driver adapter.
export function hasPostgresErrorCode(error: unknown, code: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const adapterError = error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined;
  return adapterError?.cause?.originalCode === code;
}
