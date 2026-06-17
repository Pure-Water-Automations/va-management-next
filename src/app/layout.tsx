import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "PWA VA Management",
  description: "Pure Water Automations — VA operations console",
};

// Minimal root layout (no auth) so public routes like /track can render outside
// the authenticated console shell, which lives in (app)/layout.tsx.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
