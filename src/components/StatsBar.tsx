"use client";

import { useState } from "react";
import { SOURCE_LABELS } from "@/data";
import type { Stats } from "@/lib/types";
import { formatNumber } from "@/lib/format";

function Tile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "done" | "sent" | "accent";
}) {
  const toneClass = {
    default: "text-foreground",
    done: "text-emerald-400",
    sent: "text-amber-400",
    accent: "text-blue-400",
  }[tone];

  return (
    <div className="py-1 lg:px-3 lg:first:pl-0">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-[var(--muted)]">{sub}</div>
      ) : null}
    </div>
  );
}

/** Százalék egy tizedessel, ha 10% alatt van — a 0,6% ne legyen „1%”. */
function percent(part: number, whole: number): string {
  if (!whole) return "0%";
  const value = (part / whole) * 100;
  return `${value < 10 ? value.toFixed(1).replace(".", ",") : Math.round(value)}%`;
}

export default function StatsBar({
  stats,
  filtered = false,
  totalAll,
}: {
  stats: Stats;
  /** Van-e aktív szűrő — ilyenkor a számok a szűrt halmazra vonatkoznak. */
  filtered?: boolean;
  /** A teljes adatbázis mérete, viszonyítási pontnak. */
  totalAll?: number;
}) {
  // A haladás: a címmel rendelkezőkből mennyinek ment már levél.
  const pct = stats.withEmail
    ? Math.round((stats.sent / stats.withEmail) * 100)
    : 0;
  const scope = filtered ? "szűrt lista" : "teljes lista";
  // A forrásonkénti haladás 40+ chip: alapból összecsukva. Ha csak néhány
  // forrás van a szűrt listában, kinyitni sem kell.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const fewSources = stats.bySource.length <= 3;
  const sourcesSent = stats.bySource.filter((row) => row.sent > 0).length;

  return (
    <div className="space-y-2">
      {filtered ? (
        <p className="text-xs text-blue-300">
          A számok a szűrt listára vonatkoznak
          {totalAll
            ? ` — a teljes adatbázis ${formatNumber(totalAll)} sor.`
            : "."}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-[var(--border)]">
        <Tile
          label={filtered ? "Szűrt kontakt" : "Összes kontakt"}
          value={stats.total}
          sub={
            filtered && totalAll
              ? `${formatNumber(totalAll)} sorból`
              : undefined
          }
        />
        <Tile
          label="Van e-mail cím"
          value={stats.withEmail}
          sub={`a ${scope} ${percent(stats.withEmail, stats.total)}-a`}
          tone="accent"
        />
        <Tile
          label="Elküldve"
          value={stats.sent}
          sub={`a címmel rendelkezők ${percent(stats.sent, stats.withEmail)}-a`}
          tone="sent"
        />
        <Tile
          label="Válaszolt"
          value={stats.replied}
          sub={
            stats.bounced
              ? `${formatNumber(stats.bounced)} visszapattant`
              : "a Gmail-szinkron szerint"
          }
          tone="done"
        />
        <Tile
          label="Válaszarány"
          value={stats.sent ? percent(stats.replied, stats.sent) : "—"}
          sub="válaszolt / elküldött"
          tone="done"
        />
      </div>

      {!fewSources ? (
        <button
          type="button"
          onClick={() => setSourcesOpen((value) => !value)}
          aria-expanded={sourcesOpen}
          className="text-xs text-[var(--muted)] transition hover:text-foreground"
        >
          {sourcesOpen ? "▾" : "▸"} Források ({stats.bySource.length}) ·{" "}
          {sourcesSent} forrásból ment már levél
        </button>
      ) : null}

      <div
        className={`flex flex-wrap gap-2 ${fewSources || sourcesOpen ? "" : "hidden"}`}
      >
        {stats.bySource.map((row) => (
          <div
            key={row._id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs"
          >
            <span className="text-[var(--muted)]">
              {SOURCE_LABELS[row._id] ?? row._id}
            </span>{" "}
            <span className="font-semibold tabular-nums">
              {formatNumber(row.done)}/{formatNumber(row.count)}
            </span>{" "}
            <span className="text-amber-400 tabular-nums">
              · {formatNumber(row.sent)} küldve
            </span>
          </div>
        ))}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
