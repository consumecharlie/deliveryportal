import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * Get the current authenticated user's email from the server session.
 * Returns "portal-user" as fallback when auth is not configured.
 */
export async function getSessionUserEmail(): Promise<string> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.email ?? "portal-user";
  } catch {
    return "portal-user";
  }
}
