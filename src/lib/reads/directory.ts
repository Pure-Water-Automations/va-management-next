import { db } from "@/lib/db";

/** Team directory: every active/training VA's public profile card data. */
export async function getDirectory() {
  return db.va.findMany({
    where: { status: { in: ["active", "training"] } },
    orderBy: { name: "asc" },
    select: {
      vaId: true,
      name: true,
      email: true,
      compensationRole: true,
      status: true,
      photoKey: true,
      bio: true,
      location: true,
      timezone: true,
      birthdayMonth: true,
      birthdayDay: true,
      skillSpecs: true,
      roleStartedDate: true,
      updatedAt: true,
    },
  });
}

export type DirectoryEntry = Awaited<ReturnType<typeof getDirectory>>[number];
