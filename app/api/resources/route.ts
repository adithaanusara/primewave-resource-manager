import {
  errorResponse,
  isNonEmptyString,
  isUniqueViolation,
  readJsonObject,
  serverErrorResponse,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const resources = await prisma.resource.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    });
    return Response.json(resources);
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("Request body must be a JSON object.", 400);

  const { name, description, category, capacity } = body;

  if (!isNonEmptyString(name)) return errorResponse("name is required.", 400);
  if (!isNonEmptyString(category)) return errorResponse("category is required.", 400);
  if (description != null && typeof description !== "string") {
    return errorResponse("description must be a string.", 400);
  }
  if (capacity != null && (!Number.isInteger(capacity) || (capacity as number) < 1)) {
    return errorResponse("capacity must be a positive whole number.", 400);
  }

  const categoryName = category.trim();

  try {
    const resource = await prisma.resource.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        capacity: (capacity as number | null | undefined) ?? null,
        // Categories are looked up by name and created on first use.
        category: {
          connectOrCreate: {
            where: { name: categoryName },
            create: { name: categoryName },
          },
        },
      },
      include: { category: true },
    });
    return Response.json(resource, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse("A resource with this name already exists.", 409);
    }
    return serverErrorResponse(error);
  }
}
