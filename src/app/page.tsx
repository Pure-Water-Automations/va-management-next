import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { viewForRole } from "@/lib/auth/roles";

const HOME: Record<string, string> = {
  HR: "/hr",
  PAYROLL: "/payroll",
  RECRUITMENT: "/recruitment",
  VA: "/va",
};

export default async function Home() {
  const user = await getCurrentUser();
  redirect(HOME[viewForRole(user.role)] ?? "/va");
}
