import { NextRequest, NextResponse } from "next/server";
import { getJson } from "@/lib/jobs/http";
import type { PlaceSuggestion } from "@/lib/jobs/jobassist/filters";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Hely-autocomplete proxy a Photon (OpenStreetMap) elé: kulcs nélküli,
 * ingyenes, és gépelés közbeni keresésre készült. A hívás a szerverről megy,
 * így a leíró User-Agent és az időkorlát egy helyen van.
 */
const PHOTON = "https://photon.komoot.io/api";
const MAX_PLACES = 8;

interface PhotonFeature {
  properties?: {
    name?: string;
    type?: string;
    osm_value?: string;
    country?: string;
    countrycode?: string;
    state?: string;
  };
}

/** Ország vagy „hely" (város, régió) — utca, ház és egyéb zaj kiesik. */
function classify(feature: PhotonFeature): PlaceSuggestion | null {
  const p = feature.properties;
  if (!p?.name) return null;

  if (p.type === "country") {
    return {
      label: p.name,
      name: p.name,
      kind: "country",
      countryCode: p.countrycode,
    };
  }
  const cityish = ["city", "town", "village", "municipality"].includes(
    p.osm_value ?? "",
  );
  const regionish = p.type === "state" || p.osm_value === "state";
  if (p.type === "city" || cityish || regionish) {
    const label = [
      p.name,
      p.state && p.state !== p.name ? p.state : null,
      p.country,
    ]
      .filter(Boolean)
      .join(", ");
    // A régió is városként megy tovább: a JobAssist a nevet keresi.
    return { label, name: p.name, kind: "city", countryCode: p.countrycode };
  }
  return null;
}

/** `?q=buda` → `{ places: PlaceSuggestion[] }`, legfeljebb nyolc. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ places: [] });

  try {
    const data = await getJson<{ features?: PhotonFeature[] }>(
      `${PHOTON}?q=${encodeURIComponent(q)}&lang=en&limit=10`,
      { signal: AbortSignal.timeout(10000), timeoutMs: 10000, retries: 1 },
    );

    const seen = new Set<string>();
    const places: PlaceSuggestion[] = [];
    for (const feature of data.features ?? []) {
      const place = classify(feature);
      if (!place) continue;
      const key = `${place.kind}:${place.label.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(place);
      if (places.length >= MAX_PLACES) break;
    }
    return NextResponse.json({ places });
  } catch (error) {
    return NextResponse.json(
      {
        places: [],
        error: `A helykereső nem válaszolt: ${(error as Error).message}`,
      },
      { status: 502 },
    );
  }
}
