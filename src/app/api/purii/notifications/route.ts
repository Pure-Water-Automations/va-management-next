import { getCurrentUser, getEffectiveView, getEffectiveVaId } from "@/lib/auth/access";
import { notificationsForView } from "@/lib/notifications";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const [view, vaId] = await Promise.all([getEffectiveView(user), getEffectiveVaId(user)]);
    const n = await notificationsForView(view, { name: user.name ?? user.email, vaId });
    return Response.json({ ok: true, ...n });
  } catch {
    return Response.json({ ok: false, count: 0, items: [], greeting: "" });
  }
}
