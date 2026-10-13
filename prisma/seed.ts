import "dotenv/config";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

// Sample data for local development. Safe to run more than once: existing rows
// are matched on their unique name / email and left untouched.

// Every sample user signs in with this password. Development only.
const SAMPLE_PASSWORD = "Password123!";

const categories = [
  { name: "Meeting Rooms", description: "Rooms for meetings, workshops and presentations" },
  { name: "Equipment", description: "Portable equipment that can be borrowed" },
  { name: "Workstations", description: "Shared desks and specialist machines" },
];

const resources = [
  { name: "Conference Room A", category: "Meeting Rooms", location: "Level 2", capacity: 12, description: "Video conferencing screen and whiteboard" },
  { name: "Board Room", category: "Meeting Rooms", location: "Level 5", capacity: 20, description: "Executive meeting room", requiresApproval: true },
  { name: "Projector 1", category: "Equipment", location: "IT Store", capacity: null, description: "Portable HD projector with HDMI cable" },
  { name: "Workstation 12", category: "Workstations", location: "Level 3, Bay C", capacity: 1, description: "High-memory workstation for data processing" },
];

const users = [
  { name: "Admin User", email: "admin@example.com", role: "ADMIN" as const },
  { name: "Sam Perera", email: "sam@example.com", role: "MEMBER" as const },
  { name: "Dana Silva", email: "dana@example.com", role: "MEMBER" as const },
];

const team = { name: "Engineering", description: "Product engineering team", members: ["sam@example.com", "dana@example.com"] };

// A time on a day relative to today, in the server's local time zone.
function daysFromNow(days: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const saved = await prisma.resourceCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
    categoryIds.set(saved.name, saved.id);
  }

  const resourceIds = new Map<string, string>();
  for (const { category, ...resource } of resources) {
    const saved = await prisma.resource.upsert({
      where: { name: resource.name },
      update: {},
      create: { ...resource, categoryId: categoryIds.get(category)! },
    });
    resourceIds.set(saved.name, saved.id);
  }

  const passwordHash = await hashPassword(SAMPLE_PASSWORD);
  const userIds = new Map<string, string>();
  for (const user of users) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
    userIds.set(saved.email, saved.id);
  }

  const savedTeam = await prisma.team.upsert({
    where: { name: team.name },
    update: {},
    create: { name: team.name, description: team.description },
  });
  await prisma.teamMember.createMany({
    data: team.members.map((email) => ({ teamId: savedTeam.id, userId: userIds.get(email)! })),
    skipDuplicates: true,
  });

  // Reservations have no natural unique key, so only add samples to an empty table.
  if ((await prisma.reservation.count()) === 0) {
    await prisma.reservation.createMany({
      data: [
        {
          resourceId: resourceIds.get("Conference Room A")!,
          userId: userIds.get("sam@example.com")!,
          teamId: savedTeam.id,
          title: "Sprint planning",
          startsAt: daysFromNow(1, 10),
          endsAt: daysFromNow(1, 11),
          status: "CONFIRMED",
        },
        {
          resourceId: resourceIds.get("Board Room")!,
          userId: userIds.get("dana@example.com")!,
          title: "Client presentation",
          notes: "Needs the room set up 15 minutes early",
          startsAt: daysFromNow(2, 14),
          endsAt: daysFromNow(2, 16),
          status: "PENDING",
        },
      ],
    });
  }

  const [categoryCount, resourceCount, userCount, teamCount, reservationCount] = await Promise.all([
    prisma.resourceCategory.count(),
    prisma.resource.count(),
    prisma.user.count(),
    prisma.team.count(),
    prisma.reservation.count(),
  ]);
  console.log(
    `Seed complete: ${categoryCount} categories, ${resourceCount} resources, ${userCount} users, ${teamCount} teams, ${reservationCount} reservations.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
