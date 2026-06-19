import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import type { CurrentUser } from "@/lib/auth/access";

export type ClientMembership = {
  id: string;
  clientOrganizationId: string;
  clientOrganization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    active: boolean;
  };
};

export async function getClientMembership(userId: string): Promise<ClientMembership | null> {
  return db.clientMembership.findFirst({
    where: { userId },
    select: {
      id: true,
      clientOrganizationId: true,
      clientOrganization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          active: true,
        },
      },
    },
  });
}

export function assertClientRole(user: CurrentUser): void {
  if (user.role !== "CLIENT_ADMIN" && user.role !== "CLIENT_MEMBER") {
    redirect("/");
  }
}
