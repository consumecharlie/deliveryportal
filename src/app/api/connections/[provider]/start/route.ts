// Starts the OAuth flow for the signed-in user.
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { authorizeUrl, isConfigured } from "@/lib/oauth-providers";
import type { Provider } from "@/lib/connections";

const STATE_COOKIE = "connection_oauth_state";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "slack") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const userEmail = await getSessionUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isConfigured(provider as Provider)) {
    return NextResponse.json(
      { error: `${provider} OAuth is not configured on this deployment.` },
      { status: 501 }
    );
  }

  // CSRF: a random state echoed back by the provider and compared to a cookie.
  // The user email rides along so the callback binds the tokens to the right
  // person even if the session cookie is missing on the redirect.
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}.${Buffer.from(userEmail).toString("base64url")}`;

  const res = NextResponse.redirect(authorizeUrl(provider as Provider, state));
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
