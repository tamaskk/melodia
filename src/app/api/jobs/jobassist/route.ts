import { NextRequest, NextResponse } from "next/server";
import { jobsEnv } from "@/lib/jobs/env";
import { getJson, SourceError } from "@/lib/jobs/http";
import { toPage, type JobAssistPage } from "@/lib/jobs/jobassist/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const API = "https://api.jobassist.com/v1/jobs";

/**
 * JobAssist proxy.
 *
 * A munkamenet-token így a szerveren marad, és a CORS sem akadály (a
 * JobAssist csak a saját originjének enged). A hitelesítés süti, nem Bearer:
 * a `__Secure-session-token` értéke kell a `JOBASSIST_SESSION_TOKEN`
 * beállításba. A munkamenet nagyjából hetente lejár.
 *
 * `?demo=1`: három kitalált hirdetés a kártyák kinézetéhez, token nélkül.
 * `?debug=1`: a külső API nyers válasza — a válasz alakja nincs dokumentálva.
 */
const PASSTHROUGH = [
  "search",
  "sortBy",
  "autoRelax",
  "limit",
  "page",
  "cursor",
  "exactTitles",
  "workArrangement",
  "datePosted",
  "minSalary",
  "maxSalary",
  "salaryUnit",
  "companyIndustries",
  "locationGroups",
];

const DAY_MS = 86_400_000;

/** Kitalált mintaadat — nem a JobAssisttól származik. */
const demoJobs = () => [
  {
    id: "demo-1",
    title: "Senior Frontend Engineer",
    company: "Northwind Analytics",
    location: "Budapest, Hungary",
    remote: true,
    url: "https://example.com/jobs/1",
    description:
      "React, TypeScript és Next.js alapú felületeket fejlesztünk adatelemző platformhoz. " +
      "Csapatunk elosztott, a munkanyelv angol.",
    salaryMin: 1200000,
    salaryMax: 1600000,
    currency: "HUF",
    salaryPeriod: "month",
    employmentType: "Teljes munkaidő",
    seniority: "Senior",
    postedAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
    tags: ["React", "TypeScript", "Next.js", "GraphQL"],
    matchScore: 92,
  },
  {
    id: "demo-2",
    title: "Fullstack Engineer (Go / React)",
    company: "Adyen",
    location: "Amsterdam, Netherlands",
    remote: false,
    url: "https://example.com/jobs/2",
    description:
      "Fizetési infrastruktúrát építünk. Go backend, React frontend, Kubernetes.",
    salary: "€75.000 – €95.000 / év",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    postedAt: new Date(Date.now() - 9 * DAY_MS).toISOString(),
    tags: ["Go", "React", "Kubernetes"],
    matchScore: 78,
  },
  {
    id: "demo-3",
    title: "Software Engineer, Platform",
    company: "Deutsche Telekom IT Solutions",
    location: "Budapest / Debrecen",
    remote: true,
    url: "https://example.com/jobs/3",
    description:
      "Belső fejlesztői platform üzemeltetése és bővítése, Java és Spring Boot alapon.",
    employmentType: "Teljes munkaidő",
    seniority: "Medior",
    postedAt: new Date(Date.now() - 21 * DAY_MS).toISOString(),
    tags: ["Java", "Spring Boot", "AWS"],
    matchScore: 64,
  },
];

/** A kártya három sort mutat a leírásból — ennyi bőven elég hozzá. */
const DESCRIPTION_CHARS = 400;

/** A nyers forrásobjektum és a teljes leírás nagy, a kártyának nem kell. */
const forCards = (page: JobAssistPage) => ({
  ...page,
  jobs: page.jobs.map((job) => ({
    ...job,
    raw: undefined,
    description: job.description?.slice(0, DESCRIPTION_CHARS),
  })),
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("demo") === "1") {
    return NextResponse.json({
      ...forCards(toPage({ jobs: demoJobs() })),
      demo: true,
    });
  }

  const sessionToken = jobsEnv("JOBASSIST_SESSION_TOKEN");
  if (!sessionToken) {
    return NextResponse.json(
      { error: "Hiányzó JOBASSIST_SESSION_TOKEN" },
      { status: 503 },
    );
  }

  const query = new URLSearchParams();
  for (const key of PASSTHROUGH) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  if (!query.has("limit")) query.set("limit", "50");
  if (!query.has("sortBy")) query.set("sortBy", "best-match");
  // Az autoRelax szándékosan nem alapértelmezés: kiütné a dátumszűrőt.

  try {
    const data = await getJson<unknown>(`${API}?${query}`, {
      signal: AbortSignal.timeout(20000),
      timeoutMs: 20000,
      headers: {
        Cookie: `__Secure-session-token=${sessionToken}`,
        Accept: "*/*",
        Origin: "https://jobassist.com",
        Referer: "https://jobassist.com/",
      },
      retries: 1,
    });

    if (params.get("debug") === "1") return NextResponse.json(data);
    return NextResponse.json(forCards(toPage(data)));
  } catch (error) {
    // A munkamenet-token soha nem kerülhet a hibaüzenetbe.
    const message = (error as Error).message.split(sessionToken).join("***");
    if (error instanceof SourceError && error.status === 401) {
      return NextResponse.json(
        {
          error: "A JobAssist munkamenet lejárt vagy érvénytelen.",
          hint: "Másold ki újra a __Secure-session-token süti értékét a böngésződből, és frissítsd a JOBASSIST_SESSION_TOKEN beállítást.",
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
