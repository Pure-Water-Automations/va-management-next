import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership } from "@/lib/auth/client";

export async function clientGuard() {
  try {
    const user = await getCurrentUser();
    if (user.role !== "CLIENT_ADMIN" && user.role !== "CLIENT_MEMBER") {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    const membership = await getClientMembership(user.id);
    if (!membership) {
      return { error: NextResponse.json({ error: "No client organization" }, { status: 403 }) };
    }
    return { user, membership, orgId: membership.clientOrganizationId };
  } catch (err) {
    // Re-throw Next.js redirect/not-found errors so they propagate correctly.
    if (err instanceof Error && (err.message === "NEXT_REDIRECT" || err.message === "NEXT_NOT_FOUND")) {
      throw err;
    }
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}
