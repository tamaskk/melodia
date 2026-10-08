/**
 * We Work Remotely — RSS feed.
 * https://weworkremotely.com/remote-jobs.rss
 *
 * ⚠️ ToS: „Anyone can use the feed, all we ask is that you attribute the
 * links back to We Work Remotely." — a meta.attribution ki van töltve.
 *
 * A FŐ BUKTATÓ: a `<title>` „Cégnév: Pozíció" alakú, egyetlen mezőben.
 * Szét kell bontani, különben a cégnév a pozíció címébe kerül, és a dedup
 * (ami cég + cím hashe) sosem talál egyezést a többi forrással.
 */
import { XMLParser } from "fast-xml-parser";
import { getText } from "../http";
import { asArray } from "./personio";
import {
  eligibleCountries,
  guessCountry,
  isReachableFrom,
  stripHtml,
  toISO,
} from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import type { Job } from "../types";

const FEED = "https://weworkremotely.com/remote-jobs.rss";
const TIMEOUT = 15000;

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

export interface WwrItem {
  /** „Cégnév: Pozíció" — egyetlen mezőben. */
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string | { "#text"?: string };
  /** "Anywhere in the World", "Europe" … */
  region?: string;
  country?: string;
  state?: string;
  skills?: string;
  category?: string;
  type?: string;
  expires_at?: string;
}

/**
 * A „Cégnév: Pozíció" cím szétbontása.
 *
 * Az ELSŐ kettőspont a határ — a pozíció címe maga is tartalmazhat
 * kettőspontot („Manager: Growth"). Ha nincs kettőspont, az egész a cím, és
 * a cég ismeretlen marad.
 */
export function splitTitle(raw?: string): { company?: string; title: string } {
  const text = String(raw ?? "").trim();
  const idx = text.indexOf(":");
  if (idx <= 0) return { title: text };
  const company = text.slice(0, idx).trim();
  const title = text.slice(idx + 1).trim();
  if (!company || !title) return { title: text };
  return { company, title };
}

/**
 * Egy WWR elem → közös Job séma.
 * Exportált, mert a test/wwr.test.ts a fixture-ön ellenőrzi.
 */
export function toJob(item: WwrItem): Job {
  const { company, title } = splitTitle(item.title);
  const guid = typeof item.guid === "object" ? item.guid?.["#text"] : item.guid;
  const region = [item.region, item.country, item.state]
    .filter(Boolean)
    .join(", ");
  const countries = [
    ...new Set(
      region
        .split(",")
        .map((r) => guessCountry(r.trim()))
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  return mk({
    sourceId: "wwr",
    raw: item,
    externalId: String(guid ?? item.link ?? ""),
    title,
    company: company ?? "",
    url: String(item.link ?? ""),
    location: region || "Remote",
    country: countries[0],
    alsoCountries: countries.length > 1 ? countries.slice(1) : undefined,
    remote: true,
    description: stripHtml(item.description),
    employmentType: item.type,
    postedAt: toISO(item.pubDate),
    expiresAt: toISO(item.expires_at),
    tags: [
      item.category,
      ...String(item.skills ?? "")
        .split(",")
        .map((s) => s.trim()),
    ]
      .filter(Boolean)
      .slice(0, 10) as string[],
  });
}

/** A feed szövegéből hirdetések. Exportált, hogy fixture-ön is futtatható legyen. */
export function parseFeed(xmlText: string): Job[] {
  const doc = parser.parse(xmlText) as {
    rss?: { channel?: { item?: WwrItem | WwrItem[] } };
  };
  return (
    asArray(doc?.rss?.channel?.item)
      .map(toJob)
      // Cég vagy cím nélkül a dedup értelmetlen — a toResult amúgy is dobná.
      .filter((j) => j.title)
  );
}

export const wwr = defineSource({
  meta: {
    id: "wwr",
    name: "We Work Remotely",
    category: "remote",
    auth: "none",
    regionCodes: ["global"],
    rateLimit: null,
    cacheTtlMinutes: 360,
    regions: "Globális remote",
    docs: "https://weworkremotely.com/remote-jobs.rss",
    warning:
      'RSS-feed. A cím „Cégnév: Pozíció" alakú — szétbontva kerül a sémába.',
    attribution: {
      label: "We Work Remotely",
      url: "https://weworkremotely.com",
    },
  },
  async fetch(_params, signal) {
    const text = await getText(FEED, { signal, timeoutMs: TIMEOUT });
    const eligible = eligibleCountries();
    return parseFeed(text).filter((j) =>
      isReachableFrom([j.location ?? ""], eligible),
    );
  },
});
