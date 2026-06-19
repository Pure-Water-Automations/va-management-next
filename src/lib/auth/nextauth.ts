import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const dbUser = await db.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { active: true },
      });
      return dbUser?.active === true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      if (token.email && session.user) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};
