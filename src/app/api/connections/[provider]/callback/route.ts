// OAuth callback: exchanges the code and stores the user's tokens.
import { NextResponse } from "next/server";
import { saveConnection, type Provider } from "@/lib/connections";
import { redirectUri } from "@/lib/oauth-providers";

const STATE_COOKIE = "connection_oauth_state";

function settingsRedirect(req: Request, result: string, detail?: string) {
  const url = new URL("/settings", req.url);
  url.searchParams.set("connection", result);
  if (detail) url.searchParams.set("detail", detail.slice(0, 200));
  return NextResponse.redirect(url);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "slack") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");

  // The user declined, or the provider refused.
  if (oauthError) return settingsRedirect(req, "denied", oauthError);
  if (!code) return settingsRedirect(req, "error", "No authorization code returned");

  // Verify state against the cookie set when the flow started.
  const [nonce, encodedEmail] = state.split(".");
  const cookieNonce = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];

  if (!nonce || !cookieNonce || nonce !== cookieNonce) {
    return settingsRedirect(req, "error", "State mismatch; please try again");
  }

  let userEmail: string;
  try {
    userEmail = Buffer.from(encodedEmail, "base64url").toString("utf8");
    if (!userEmail.endsWith("@consume-media.com")) throw new Error("bad domain");
  } catch {
    return settingsRedirect(req, "error", "Could not identify the signed-in user");
  }

  try {
    if (provider === "google") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: redirectUri("google"),
          grant_type: "authorization_code",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        return settingsRedirect(req, "error", data.error_description ?? data.error ?? "Token exchange failed");
      }
      // Without a refresh token we cannot act on their behalf tomorrow, which
      // is the entire point. Treat it as a failure rather than storing a token
      // that silently dies in an hour.
      if (!data.refresh_token) {
        return settingsRedirect(
          req,
          "error",
          "Google did not return a refresh token. Remove the portal at myaccount.google.com/permissions and reconnect."
        );
      }

      await saveConnection({
        userEmail,
        provider: "google" as Provider,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
        scopes: data.scope ?? "",
        externalLabel: userEmail,
      });
      return settingsRedirect(req, "connected");
    }

    // Slack
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID ?? "",
        client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri("slack"),
      }),
    });
    const data = await res.json();
    // Slack returns HTTP 200 with { ok: false } on failure.
    if (!data.ok || !data.authed_user?.access_token) {
      return settingsRedirect(req, "error", data.error ?? "Slack token exchange failed");
    }

    await saveConnection({
      userEmail,
      provider: "slack" as Provider,
      accessToken: data.authed_user.access_token,
      // Only present when token rotation is enabled on the Slack app.
      refreshToken: data.authed_user.refresh_token ?? null,
      expiresAt: data.authed_user.expires_in
        ? new Date(Date.now() + Number(data.authed_user.expires_in) * 1000)
        : null,
      scopes: data.authed_user.scope ?? "",
      externalId: data.authed_user.id ?? null,
      externalLabel: data.team?.name ? `${data.team.name}` : null,
    });
    return settingsRedirect(req, "connected");
  } catch (err) {
    console.error(`${provider} OAuth callback failed:`, err);
    return settingsRedirect(req, "error", "Unexpected error completing the connection");
  }
}
