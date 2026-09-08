/**
 * Best-effort parsing of a Google Maps / Google Business Profile share URL so the
 * onboarding flow can auto-fill a business name from just a pasted link — no manual
 * data entry required before the user hits "Allow".
 */
export function parseGoogleMapsUrl(raw: string): { name: string | null; placeId: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { name: null, placeId: null };

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return { name: null, placeId: null };
  }

  const placeId =
    url.searchParams.get("query_place_id") ??
    url.searchParams.get("place_id") ??
    (() => {
      const match = trimmed.match(/!1s(0x[0-9a-fA-F:]+)/);
      return match ? match[1]! : null;
    })();

  // .../maps/place/Business+Name/@lat,lng,...  or  .../maps/place/Business+Name
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
  let name: string | null = null;
  if (placeMatch?.[1]) {
    name = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
  } else {
    const q = url.searchParams.get("q");
    if (q && !/^https?:\/\//.test(q)) name = q.trim();
  }

  return { name: name || null, placeId };
}

export function isLikelyGoogleUrl(raw: string): boolean {
  return /google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(raw.trim());
}
