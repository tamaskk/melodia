/**
 * Kulcsot igénylő források + a Bundesagentur (publikus, megosztott kulcs).
 *
 * Ha egy forráshoz nincs beállítva env változó, a keresés kihagyja, és a UI
 * megmutatja, mit kellene beállítani. Semmi nem törik el nélkülük.
 */
import { jobsEnv } from "../env";
import { getJson } from "../http";
import { guessCountry, looksRemote, stripHtml, toISO } from "../normalize";
import { defineSource, makeJob as mk } from "./base";
import { bajobsuche } from "./ba-jobsuche";
import { jooble } from "./jooble";
import { careerjet } from "./careerjet";
import { adzuna } from "./adzuna";
import { themuse } from "./themuse";
import { hnWhoIsHiring } from "./hn-whoishiring";
import type { JobSource } from "../types";

const TIMEOUT = 15000;

/* ------------------------------------------------------------------- JSearch */

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_apply_link?: string;
  job_city?: string;
  job_country?: string;
  job_is_remote?: boolean;
  job_description?: string;
  job_employment_type?: string;
  job_posted_at_datetime_utc?: string;
  job_publisher?: string;
}

const jsearch = defineSource({
  meta: {
    id: "jsearch",
    name: "JSearch (LinkedIn/Indeed)",
    category: "aggregator",
    auth: "key",
    regionCodes: ["global"],
    rateLimit: { perMonth: 200 },
    cacheTtlMinutes: 1440,
    envKeys: ["RAPIDAPI_KEY"],
    regions: "Globális, Google Jobs aggregáció",
    docs: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
    warning:
      "Google-SERP scraping alapú. 200 kérés/hó. A forrásplatformok ToS-e rád is vonatkozik.",
  },
  async fetch(p, signal) {
    const params = new URLSearchParams({
      query: p.q
        ? `${p.q} in ${jobsEnv("JSEARCH_LOCATION") ?? "Europe"}`
        : "software engineer",
      page: "1",
      num_pages: "1",
      date_posted: "month",
    });
    const data = await getJson<{ data?: JSearchJob[] }>(
      `https://jsearch.p.rapidapi.com/search?${params}`,
      {
        signal,
        timeoutMs: TIMEOUT,
        headers: {
          "X-RapidAPI-Key": jobsEnv("RAPIDAPI_KEY")!,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      },
    );
    return (data.data ?? []).map((j) => {
      const location =
        [j.job_city, j.job_country].filter(Boolean).join(", ") || undefined;
      return mk({
        sourceId: "jsearch",
        raw: j,
        externalId: String(j.job_id),
        title: String(j.job_title ?? ""),
        company: String(j.employer_name ?? ""),
        url: j.job_apply_link ?? "",
        location,
        country:
          j.job_country?.length === 2
            ? String(j.job_country).toUpperCase()
            : guessCountry(location),
        remote: j.job_is_remote === true || looksRemote(location, j.job_title),
        description: stripHtml(j.job_description),
        employmentType: j.job_employment_type,
        postedAt: toISO(j.job_posted_at_datetime_utc),
        tags: j.job_publisher ? [String(j.job_publisher)] : undefined,
      });
    });
  },
});

export const keyedSources: JobSource[] = [
  bajobsuche,
  themuse,
  hnWhoIsHiring,
  adzuna,
  jooble,
  careerjet,
  jsearch,
];
