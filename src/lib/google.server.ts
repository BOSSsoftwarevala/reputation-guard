/**
 * Google Business Profile integration (server only).
 * OAuth token handling, live location + review reads, and removal-outcome detection.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { parseGoogleMapsUrl } from "./google-url";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";
const PLACES_API = "https://maps.googleapis.com/maps/api/place";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

function credentials() {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Business Profile credentials are not configured. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

function stateSecret() {
  return process.env["CRON_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "orbitrep";
}

export function signState(payload: { businessId: string; userId: string; redirectTo: string }) {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const mac = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string) {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    businessId: string;
    userId: string;
    redirectTo: string;
    ts: number;
  };
  if (Date.now() - parsed.ts > 15 * 60 * 1000) return null;
  return parsed;
}

export function buildAuthUrl(redirectUri: string, state: string) {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${GOOGLE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  return (await response.json()) as GoogleTokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Google refused to refresh the connection (${response.status}). Reconnect the Google account.`,
    );
  }
  return (await response.json()) as GoogleTokens;
}

/**
 * Revoke a stored token with Google so the client's Google account no longer
 * shows this app as authorized. Best-effort: disconnect must still succeed
 * locally even if Google's revoke endpoint is unreachable or the token was
 * already invalidated on Google's side.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchGoogleEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { email?: string };
  return body.email ?? null;
}

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const text = await response.text();
    let reason: string | undefined;
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string; status?: string; details?: { reason?: string }[] };
      };
      message = parsed.error?.message ?? message;
      reason = parsed.error?.details?.find((d) => d.reason)?.reason ?? parsed.error?.status;
    } catch {
      // Non-JSON error body — keep the raw text above.
    }
    const error = new Error(`Google API ${response.status}: ${message}`) as Error & {
      status?: number;
      reason?: string;
    };
    error.status = response.status;
    if (reason) error.reason = reason;
    throw error;
  }
  return (await response.json()) as T;
}

export type GoogleAccount = { name: string; accountName?: string; type?: string };
export type GoogleLocation = {
  name: string;
  title?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; regionCode?: string };
};

export async function listAccounts(accessToken: string) {
  const body = await googleGet<{ accounts?: GoogleAccount[] }>(
    `${ACCOUNTS_API}/accounts?pageSize=20`,
    accessToken,
  );
  return body.accounts ?? [];
}

export async function listLocations(accessToken: string, account: string) {
  const readMask = "name,title,storefrontAddress";
  const body = await googleGet<{ locations?: GoogleLocation[] }>(
    `${INFO_API}/${account}/locations?pageSize=100&readMask=${readMask}`,
    accessToken,
  );
  return body.locations ?? [];
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export type GoogleReview = {
  name?: string;
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
};

export type NormalizedReview = {
  google_review_name: string;
  source_review_id: string;
  reviewer_name: string;
  reviewer_profile_url: string | null;
  rating: number;
  review_text: string;
  review_date: string;
};

/** Reads every review page for one Google location (handles thousands via pagination). */
export async function fetchAllReviews(
  accessToken: string,
  account: string,
  locationResource: string,
  maxPages = 40,
): Promise<NormalizedReview[]> {
  const locationId = locationResource.split("/").pop();
  const base = `${REVIEWS_API}/${account}/locations/${locationId}/reviews`;
  const out: NormalizedReview[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const url = `${base}?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const body = await googleGet<{ reviews?: GoogleReview[]; nextPageToken?: string }>(url, accessToken);
    for (const review of body.reviews ?? []) {
      const id = review.reviewId ?? review.name?.split("/").pop() ?? "";
      if (!id) continue;
      const created = review.createTime ? new Date(review.createTime) : new Date();
      out.push({
        google_review_name: review.name ?? `${account}/locations/${locationId}/reviews/${id}`,
        source_review_id: id,
        reviewer_name: review.reviewer?.displayName?.trim() || "Anonymous",
        reviewer_profile_url: review.reviewer?.profilePhotoUrl ?? null,
        rating: STAR_MAP[review.starRating ?? "FIVE"] ?? 5,
        review_text: review.comment ?? "",
        review_date: (Number.isNaN(created.getTime()) ? new Date() : created).toISOString(),
      });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

type PlacesFindResponse = {
  status: string;
  error_message?: string;
  candidates?: { place_id?: string; name?: string; formatted_address?: string }[];
};

type PlacesReview = {
  author_name?: string;
  author_url?: string;
  rating?: number;
  text?: string;
  time?: number;
};

type PlacesDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    url?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: PlacesReview[];
  };
};

function mapsApiKey() {
  const key = process.env["GOOGLE_API_KEY"] ?? process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) throw new Error("Google Maps API key is not configured on the server.");
  return key;
}

async function placesGet<T extends { status: string; error_message?: string }>(path: string, params: Record<string, string>) {
  const url = new URL(`${PLACES_API}/${path}/json`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", mapsApiKey());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Places API ${response.status}: ${response.statusText}`);
  const body = (await response.json()) as T;
  if (body.status !== "OK") {
    throw new Error(`Google Places API ${body.status}: ${body.error_message ?? "No matching place/reviews returned."}`);
  }
  return body;
}

async function resolveGoogleMapsUrl(raw: string) {
  try {
    const response = await fetch(raw, { method: "GET", redirect: "follow" });
    return response.url || raw;
  } catch {
    return raw;
  }
}

function reviewSourceId(placeId: string, review: PlacesReview) {
  const key = [
    placeId,
    review.author_name ?? "Anonymous",
    review.time ?? "",
    review.rating ?? "",
    review.text ?? "",
  ].join("|");
  return `places-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

/**
 * Temporary legitimate fallback for demos while GBP Basic API Access quota is 0:
 * reads public Google Places review snippets for a pasted Maps/GBP URL using the
 * server-side Google Maps key. It never fabricates reviews and never bypasses
 * Google authentication/quota controls.
 */
export async function fetchPublicPlaceReviewsFromUrl(raw: string): Promise<{
  placeId: string;
  placeName: string;
  placeUrl: string | null;
  address: string | null;
  reviews: NormalizedReview[];
}> {
  const resolvedUrl = await resolveGoogleMapsUrl(raw);
  const parsed = parseGoogleMapsUrl(resolvedUrl);
  let placeId = parsed.placeId;

  if (!placeId) {
    const query = parsed.name ?? raw;
    const found = await placesGet<PlacesFindResponse>("findplacefromtext", {
      input: query,
      inputtype: "textquery",
      fields: "place_id,name,formatted_address",
    });
    placeId = found.candidates?.[0]?.place_id ?? null;
  }

  if (!placeId) throw new Error("Google could not identify a place from that URL.");

  const details = await placesGet<PlacesDetailsResponse>("details", {
    place_id: placeId,
    fields: "place_id,name,formatted_address,url,rating,user_ratings_total,reviews",
    reviews_sort: "newest",
  });
  const place = details.result;
  if (!place?.place_id) throw new Error("Google Places did not return a usable place record.");

  const reviews = (place.reviews ?? []).map((review) => {
    const source = reviewSourceId(place.place_id!, review);
    return {
      google_review_name: `places/${place.place_id}/reviews/${source}`,
      source_review_id: source,
      reviewer_name: review.author_name?.trim() || "Anonymous",
      reviewer_profile_url: review.author_url ?? null,
      rating: Math.min(5, Math.max(1, Math.round(review.rating ?? 5))),
      review_text: review.text ?? "",
      review_date: new Date((review.time ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    };
  });

  return {
    placeId: place.place_id,
    placeName: place.name ?? parsed.name ?? "Google Business",
    placeUrl: place.url ?? null,
    address: place.formatted_address ?? null,
    reviews,
  };
}
