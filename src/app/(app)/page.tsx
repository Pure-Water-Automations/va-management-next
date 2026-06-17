import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveView } from "@/lib/auth/access";

const HOME: Record<string, string> = {
  HR: "/hr",
  PAYROLL: "/payroll",
  RECRUITMENT: "/recruitment",
  VA: "/va",
};

export default async function Home() {
  const user = await getCurrentUser();
  redirect(HOME[await getEffectiveView(user)] ?? "/va");
}
