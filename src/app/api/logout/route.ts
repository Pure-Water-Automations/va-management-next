import { redirect } from "next/navigation";

export async function GET() {
  redirect("/api/auth/signout");
}
