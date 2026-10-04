"use client";

import { useMemo, useState } from "react";

export interface DailyPoint {
  day: string;
  sent: number;
  replies: number;
}

const WIDTH = 1200;
const HEIGHT = 300;
const PAD = { top: 16, right: 46, bottom: 30, left: 46 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/** Gördülő ablak a válaszarányhoz: egy nap válaszai nem az aznapi levelekre jönnek. */
const RATE_WINDOW = 7;

/**
 * 7 napos gördülő válaszarány (%): az utolsó 7 nap válaszai / küldései.
 * Ahol az ablakban nem ment ki levél, ott nincs érték (a vonal megszakad).
 */
function rollingRate(data: DailyPoint[]): (number | null)[] {
  return data.map((_, index) => {
    const from = Math.max(0, index - RATE_WINDOW + 1);
    let sent = 0;
    let replies = 0;
    for (let i = from; i <= index; i += 1) {
      sent += data[i].sent;
      replies += data[i].replies;
    }
    return sent ? Math.min(100, (replies / sent) * 100) : null;
  });
}

/**
 * Kerek tengelymaximum, ami néggyel osztható — így a negyedelő rácsvonalak is
 * kerek számok (20 → 5, 10, 15; 60 → 15, 30, 45).
 */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 4, 6, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value && candidate % 4 === 0) return candidate;
  }
  return 20 * magnitude;
}

function label(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(month)}.${Number(date)}.`;
}

function longLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("hu", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/**
 * Napi levélforgalom: hátul a kiküldött levelek, elöl a visszaérkezett
 * válaszok. Két réteg, két szín — a hátsó adja a nagyságrendet, az elülső azt,
 * ami tényleg érdekes.
 *
 * Szándékosan sima SVG, nem diagram-könyvtár: két sorozatnyi adathoz egy
 * 40 kB-os csomag felesleges teher volna.
 */
export default function MailChart({
  data,
  days,
  onDaysChange,
}: {
  data: DailyPoint[];
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const {
    ticks,
    x,
    y,
    sentArea,
    sentLine,
    replyArea,
    replyLine,
    rates,
    rateMax,
    rateLine,
  } = useMemo(() => {
    const peak = Math.max(
      1,
      ...data.map((point) => Math.max(point.sent, point.replies)),
    );
    const max = niceMax(peak);
    const step = data.length > 1 ? PLOT_W / (data.length - 1) : 0;

    const x = (index: number) => PAD.left + index * step;
    const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;

    const line = (key: "sent" | "replies") =>
      data
        .map(
          (point, index) => `${index ? "L" : "M"}${x(index)},${y(point[key])}`,
        )
        .join(" ");

    const area = (key: "sent" | "replies") =>
      `${line(key)} L${x(data.length - 1)},${PAD.top + PLOT_H} L${x(0)},${PAD.top + PLOT_H} Z`;

    // A jobb tengely a válaszarány: 0-tól a legnagyobb értékig, kerek 10%-okra.
    const rates = rollingRate(data);
    // 20-as lépcsőkre kerekítve: a negyedek így kerek százalékok (20 → 5, 10, 15 …).
    const rateMax = Math.max(
      20,
      Math.ceil(Math.max(0, ...rates.map((rate) => rate ?? 0)) / 20) * 20,
    );
    const rateY = (value: number) =>
      PAD.top + PLOT_H - (value / rateMax) * PLOT_H;
    // Új szakasz ott kezdődik, ahol az előző napon nem volt érték.
    const rateLine = rates
      .map((rate, index) =>
        rate === null
          ? ""
          : `${index > 0 && rates[index - 1] !== null ? "L" : "M"}${x(index)},${rateY(rate)}`,
      )
      .filter(Boolean)
      .join(" ");

    return {
      rates,
      rateMax,
      rateLine,
      ticks: [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(max * ratio)),
      x,
      y,
      sentArea: area("sent"),
      sentLine: line("sent"),
      replyArea: area("replies"),
      replyLine: line("replies"),
    };
  }, [data]);

  const totalSent = data.reduce((sum, point) => sum + point.sent, 0);
  const totalReplies = data.reduce((sum, point) => sum + point.replies, 0);
  // Minden napra nem fér ki felirat; ritkítunk, de az utolsó nap mindig kell.
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const active = hover !== null ? data[hover] : null;
  const dots = data.length <= 40;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Napi levélforgalom</h2>

        <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="inline-block size-2.5 rounded-sm bg-[#e8b04b]" />
          kiküldve
          <span className="font-medium text-foreground">{totalSent}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="inline-block size-2.5 rounded-sm bg-[#34d399]" />
          válasz jött
          <span className="font-medium text-foreground">{totalReplies}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[#60a5fa]" />
          válaszarány, 7 napos (jobb tengely)
        </span>

        <div className="ml-auto flex overflow-hidden rounded-lg border border-[var(--border)]">
          {[14, 30, 90].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onDaysChange(option)}
              className={`h-8 px-3 text-xs transition ${
                days === option
                  ? "bg-blue-500/15 text-blue-200"
                  : "text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {option} nap
            </button>
          ))}
        </div>
      </div>

      {/* A magasságot a viewBox aránya adja: így nem marad üres sáv a diagram
          két oldalán széles képernyőn. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Napi kiküldött és visszaérkezett levelek"
      >
        <defs>
          <linearGradient id="mail-sent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8b04b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#e8b04b" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="mail-reply" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.08" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.35 : 0.12}
              className="text-[var(--muted)]"
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-[var(--muted)] text-[11px]"
            >
              {tick}
            </text>
            <text
              x={WIDTH - PAD.right + 8}
              y={y(tick) + 4}
              textAnchor="start"
              className="fill-[#60a5fa] text-[11px]"
            >
              {Math.round((tick / (ticks[ticks.length - 1] || 1)) * rateMax)}%
            </text>
          </g>
        ))}

        {/* Hátul a kiküldött levelek: ez adja a nagyságrendet. */}
        <path d={sentArea} fill="url(#mail-sent)" />
        <path d={sentLine} fill="none" stroke="#e8b04b" strokeWidth={2} />

        {/* Elöl a válaszok — ez a kisebb és fontosabb szám. */}
        <path d={replyArea} fill="url(#mail-reply)" />
        <path d={replyLine} fill="none" stroke="#34d399" strokeWidth={2} />

        {/* Legfelül a 7 napos válaszarány — a jobb tengelyen olvasható. */}
        <path
          d={rateLine}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeDasharray="6 4"
        />

        {dots
          ? data.map((point, index) => (
              <g key={point.day}>
                <circle cx={x(index)} cy={y(point.sent)} r={3} fill="#e8b04b" />
                <circle
                  cx={x(index)}
                  cy={y(point.replies)}
                  r={3}
                  fill="#34d399"
                />
              </g>
            ))
          : null}

        {data.map((point, index) =>
          (index % labelEvery === 0 &&
            data.length - 1 - index >= labelEvery / 2) ||
          index === data.length - 1 ? (
            <text
              key={`label-${point.day}`}
              x={x(index)}
              y={HEIGHT - 10}
              textAnchor="middle"
              className="fill-[var(--muted)] text-[11px]"
            >
              {label(point.day)}
            </text>
          ) : null,
        )}

        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            className="text-[var(--muted)]"
          />
        ) : null}

        {/* Érzékeny sávok: egy nap egy oszlop, így pontosan lehet célozni. */}
        {data.map((point, index) => (
          <rect
            key={`hit-${point.day}`}
            x={x(index) - PLOT_W / Math.max(1, data.length - 1) / 2}
            y={PAD.top}
            width={PLOT_W / Math.max(1, data.length - 1)}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>

      <p className="min-h-[18px] text-xs text-[var(--muted)]">
        {active ? (
          <>
            <span className="text-foreground">{longLabel(active.day)}</span> ·{" "}
            <span className="text-[#e8b04b]">{active.sent} kiküldve</span> ·{" "}
            <span className="text-[#34d399]">{active.replies} válasz</span>
            {hover !== null && rates[hover] !== null ? (
              <>
                {" "}
                ·{" "}
                <span className="text-[#60a5fa]">
                  {Math.round(rates[hover] ?? 0)}% az utolsó 7 napban
                </span>
              </>
            ) : null}
          </>
        ) : (
          "Vidd az egeret a diagram fölé egy nap számaiért. A visszapattanó levelek nem számítanak válasznak."
        )}
      </p>
    </div>
  );
}
