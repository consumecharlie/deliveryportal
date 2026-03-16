import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Restrict to @consume-media.com domain
      if (account?.provider === "google") {
        return profile?.email?.endsWith("@consume-media.com") ?? false;
      }
      return false;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.picture = (profile as { picture?: string }).picture;
        token.name = profile.name;
        token.email = profile.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name ?? null;
        session.user.email = (token.email as string) ?? session.user.email ?? null;
        session.user.image = (token.picture as string) ?? session.user.image ?? null;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        domain: ".consume-media.com",
        path: "/",
        httpOnly: true,
        sameSite: "lax" as const,
        secure: true,
      },
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
};
