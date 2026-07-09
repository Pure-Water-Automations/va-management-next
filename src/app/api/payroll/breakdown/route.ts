import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/access";
import { getVaPeriodBreakdown } from "@/lib/reads/payroll";

const STAFF = new Set(["BOOKKEEPER", "HR_MANAGER", "PEOPLE_OPS"]);

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const vaId = req.nextUrl.searchParams.get("vaId") ?? "";
  const start = new Date(req.nextUrl.searchParams.get("start") ?? "");
  const end = new Date(req.nextUrl.searchParams.get("end") ?? "");
  if (!vaId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ ok: false, error: "vaId, start, end required" }, { status: 400 });
  }

  const staff = user.isAdmin || STAFF.has(user.role);
  if (!staff && user.vaId !== vaId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, result: await getVaPeriodBreakdown(vaId, start, end) });
}
