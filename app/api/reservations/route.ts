import {
  PG_EXCLUSION_VIOLATION,
  errorResponse,
  hasPostgresErrorCode,
  isNonEmptyString,
  isUuid,
  readJsonObject,
  serverErrorResponse,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Never return password hashes alongside a reservation.
const reservationInclude = {
  resource: { include: { category: true } },
  user: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
} as const;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: reservationInclude,
      orderBy: { startsAt: "asc" },
    });
    return Response.json(reservations);
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return errorResponse("Request body must be a JSON object.", 400);

  const { userId, resourceId, teamId, title, notes } = body;

  if (!isUuid(userId)) return errorResponse("userId is required and must be a valid id.", 400);
  if (!isUuid(resourceId)) return errorResponse("resourceId is required and must be a valid id.", 400);
  if (teamId != null && !isUuid(teamId)) return errorResponse("teamId must be a valid id.", 400);
  if (!isNonEmptyString(title)) return errorResponse("title is required.", 400);
  if (notes != null && typeof notes !== "string") return errorResponse("notes must be a string.", 400);

  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  if (!startsAt || !endsAt) {
    return errorResponse("startsAt and endsAt are required and must be ISO 8601 date-times.", 400);
  }
  if (endsAt <= startsAt) return errorResponse("endsAt must be after startsAt.", 400);
  if (startsAt < new Date()) return errorResponse("A reservation cannot start in the past.", 400);

  try {
    const [user, resource, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.resource.findUnique({ where: { id: resourceId } }),
      teamId ? prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } }) : null,
    ]);

    if (!user || !user.isActive) return errorResponse("User not found.", 404);
    if (!resource) return errorResponse("Resource not found.", 404);
    if (resource.status !== "ACTIVE") {
      return errorResponse("This resource is not currently available for reservations.", 409);
    }
    if (teamId && !membership) {
      return errorResponse("The user is not a member of this team.", 403);
    }

    const reservation = await prisma.reservation.create({
      data: {
        userId,
        resourceId,
        teamId: teamId ?? null,
        title: title.trim(),
        notes: notes?.trim() || null,
        startsAt,
        endsAt,
        status: resource.requiresApproval ? "PENDING" : "CONFIRMED",
      },
      include: reservationInclude,
    });
    return Response.json(reservation, { status: 201 });
  } catch (error) {
    // The database rejects overlapping bookings, so two simultaneous requests
    // for the same slot cannot both succeed.
    if (hasPostgresErrorCode(error, PG_EXCLUSION_VIOLATION)) {
      return errorResponse("This resource is already reserved for part of that time.", 409);
    }
    return serverErrorResponse(error);
  }
}
