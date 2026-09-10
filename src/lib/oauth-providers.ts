/**
 * OAuth provider configuration for per-user connections.
 *
 * Deliberately separate from NextAuth sign-in: signing into the portal must not
 * prompt for Gmail access. These are opt-in connections a user grants when they
 * want the portal to draft or post on their behalf.
 */

import type { Provider } from "@/lib/connections";

/** Manage drafts AND send. One scope covers both behaviours. */
export const GOOGLE_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.compose";

/** Posting as the user (not the bot), matching how n8n posts today. */
export const SLACK_USER_SCOPE = "chat:write";

export function baseUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3002"
  );
}

export function redirectUri(provider: Provider): string {
  return `${baseUrl()}/api/connections/${provider}/callback`;
}

export function isConfigured(provider: Provider): boolean {
  if (provider === "google") {
    return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  }
  return !!process.env.SLACK_CLIENT_ID && !!process.env.SLACK_CLIENT_SECRET;
}

export function authorizeUrl(provider: Provider, state: string): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri("google"),
      response_type: "code",
      scope: GOOGLE_SEND_SCOPE,
      // offline + consent guarantee a refresh token. Without prompt=consent
      // Google omits it on re-authorization, leaving us unable to refresh.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    redirect_uri: redirectUri("slack"),
    // user_scope (not scope): we want a user token so messages post as them.
    user_scope: SLACK_USER_SCOPE,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}
