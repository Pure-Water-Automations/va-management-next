import "./globals.css";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/access";
import { Sidebar } from "@/components/Sidebar";

export const metadata = {
  title: "PWA VA Management",
  description: "Pure Water Automations — VA operations console",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar role={user.role} name={user.name ?? user.email} />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
