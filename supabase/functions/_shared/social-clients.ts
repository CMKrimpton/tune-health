// ═══════════════════════════════════════════════════════════════════════════
// Social Media Platform Clients — Free APIs Only
// Bluesky (AT Protocol), Reddit (OAuth2), Mastodon (ActivityPub)
// All other platforms: stubs for Phase 2+
// ═══════════════════════════════════════════════════════════════════════════

const TIMEOUT = 30_000;

// ─── Types ───────────────────────────────────────────────────────────────

export interface PlatformResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
}

export interface EngagementData {
  impressions: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
}

// ─── Bluesky (AT Protocol) ──────────────────────────────────────────────

interface BlueskySession {
  accessJwt: string;
  did: string;
}

let blueskySessionCache: { session: BlueskySession; expiresAt: number } | null = null;

async function blueskyCreateSession(): Promise<BlueskySession> {
  // Return cached session if still valid (refresh 5 min before expiry)
  if (blueskySessionCache && Date.now() < blueskySessionCache.expiresAt - 300_000) {
    return blueskySessionCache.session;
  }

  const handle = (Deno.env.get("BLUESKY_HANDLE") || "").trim();
  const password = (Deno.env.get("BLUESKY_APP_PASSWORD") || "").trim();
  if (!handle || !password) throw new Error("BLUESKY_HANDLE or BLUESKY_APP_PASSWORD not set");

  const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Bluesky auth failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const session: BlueskySession = { accessJwt: data.accessJwt, did: data.did };

  // Cache for ~2 hours (AT Protocol tokens last ~2h)
  blueskySessionCache = { session, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  return session;
}

/** Detect URLs in text and create Bluesky facets for them. */
function detectBlueskyFacets(text: string): Array<{ index: { byteStart: number; byteEnd: number }; features: Array<{ $type: string; uri: string }> }> {
  const facets: Array<{ index: { byteStart: number; byteEnd: number }; features: Array<{ $type: string; uri: string }> }> = [];
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  const encoder = new TextEncoder();
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const beforeBytes = encoder.encode(text.slice(0, match.index)).byteLength;
    const matchBytes = encoder.encode(match[0]).byteLength;
    facets.push({
      index: { byteStart: beforeBytes, byteEnd: beforeBytes + matchBytes },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
    });
  }
  return facets;
}

export async function postToBluesky(text: string): Promise<PlatformResult> {
  try {
    const session = await blueskyCreateSession();
    const facets = detectBlueskyFacets(text);

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
    };
    if (facets.length > 0) record.facets = facets;

    const res = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { success: false, error: `Bluesky post failed (${res.status}): ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const rkey = data.uri?.split("/").pop() || "";
    const handle = (Deno.env.get("BLUESKY_HANDLE") || "").trim();
    return {
      success: true,
      platformPostId: data.uri,
      platformUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown Bluesky error" };
  }
}

export async function getBlueskyEngagement(uri: string): Promise<EngagementData> {
  try {
    const session = await blueskyCreateSession();
    const res = await fetch(`https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`, {
      headers: { Authorization: `Bearer ${session.accessJwt}` },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { impressions: 0, likes: 0, shares: 0, comments: 0, clicks: 0 };
    const data = await res.json();
    const post = data.thread?.post;
    return {
      impressions: 0, // AT Protocol doesn't expose impressions
      likes: post?.likeCount || 0,
      shares: post?.repostCount || 0,
      comments: post?.replyCount || 0,
      clicks: 0, // Not available via AT Protocol
    };
  } catch {
    return { impressions: 0, likes: 0, shares: 0, comments: 0, clicks: 0 };
  }
}

// ─── Reddit (OAuth2) ────────────────────────────────────────────────────

let redditTokenCache: { token: string; expiresAt: number } | null = null;

async function redditGetAccessToken(): Promise<string> {
  if (redditTokenCache && Date.now() < redditTokenCache.expiresAt - 60_000) {
    return redditTokenCache.token;
  }

  const clientId = (Deno.env.get("REDDIT_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("REDDIT_CLIENT_SECRET") || "").trim();
  const username = (Deno.env.get("REDDIT_USERNAME") || "").trim();
  const password = (Deno.env.get("REDDIT_PASSWORD") || "").trim();
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error("Reddit credentials not configured (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD)");
  }

  const auth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "alumi-news-bot/1.0",
    },
    body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    signal: AbortSignal.timeout(TIMEOUT),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Reddit auth failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  redditTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

export async function postToReddit(
  title: string,
  body: string,
  opts: { subreddit: string; kind?: "link" | "self"; url?: string },
): Promise<PlatformResult> {
  try {
    const token = await redditGetAccessToken();
    const params = new URLSearchParams({
      sr: opts.subreddit,
      kind: opts.kind || "self",
      title,
      resubmit: "true",
      api_type: "json",
    });
    if (opts.kind === "link" && opts.url) {
      params.set("url", opts.url);
    } else {
      params.set("text", body);
    }

    const res = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "alumi-news-bot/1.0",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { success: false, error: `Reddit submit failed (${res.status}): ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const postData = data.json?.data;
    if (data.json?.errors?.length > 0) {
      return { success: false, error: `Reddit error: ${JSON.stringify(data.json.errors)}` };
    }

    return {
      success: true,
      platformPostId: postData?.name || postData?.id,
      platformUrl: postData?.url || `https://reddit.com${postData?.permalink || ""}`,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown Reddit error" };
  }
}

export async function getRedditEngagement(postId: string): Promise<EngagementData> {
  try {
    const token = await redditGetAccessToken();
    const res = await fetch(`https://oauth.reddit.com/api/info?id=${postId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "alumi-news-bot/1.0",
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { impressions: 0, likes: 0, shares: 0, comments: 0, clicks: 0 };
    const data = await res.json();
    const post = data.data?.children?.[0]?.data;
    return {
      impressions: post?.view_count || 0,
      likes: post?.ups || 0,
      shares: post?.crossposts?.length || 0,
      comments: post?.num_comments || 0,
      clicks: 0,
    };
  } catch {
    return { impressions: 0, likes: 0, shares: 0, comments: 0, clicks: 0 };
  }
}

// ─── Mastodon (ActivityPub) ─────────────────────────────────────────────

export async function postToMastodon(text: string): Promise<PlatformResult> {
  try {
    const token = (Deno.env.get("MASTODON_ACCESS_TOKEN") || "").trim();
    const instance = (Deno.env.get("MASTODON_INSTANCE") || "mastodon.social").trim();
    if (!token) throw new Error("MASTODON_ACCESS_TOKEN not set");

    const res = await fetch(`https://${instance}/api/v1/statuses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: text }),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { success: false, error: `Mastodon post failed (${res.status}): ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    return {
      success: true,
      platformPostId: data.id,
      platformUrl: data.url,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown Mastodon error" };
  }
}

// ─── Platform Router ────────────────────────────────────────────────────
// Routes post to the correct platform client

export async function postToPlatform(
  platform: string,
  content: string,
  meta: Record<string, unknown> = {},
): Promise<PlatformResult> {
  switch (platform) {
    case "bluesky":
      return postToBluesky(content);
    case "mastodon":
      return postToMastodon(content);
    case "reddit":
      return postToReddit(
        (meta.title as string) || content.slice(0, 300),
        content,
        {
          subreddit: (meta.subreddit as string) || "health",
          kind: (meta.kind as "link" | "self") || "self",
          url: meta.url as string | undefined,
        },
      );
    // Stubs for Phase 2+ platforms
    case "x":
      return { success: false, error: "X/Twitter: manual posting required (content queued in dashboard)" };
    case "linkedin":
    case "threads":
    case "telegram":
    case "medium":
    case "pinterest":
    case "instagram":
    case "whatsapp":
    case "newsletter":
    case "quora":
    case "hackernews":
      return { success: false, error: `${platform}: API client not yet configured (Phase 2)` };
    default:
      return { success: false, error: `Unknown platform: ${platform}` };
  }
}
