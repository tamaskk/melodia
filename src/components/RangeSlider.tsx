"use client";

const THUMB =
  "range-thumb pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent";

/**
 * Kétfogantyús tartomány-csúszka: két egymásra tett natív csúszka, köztük a
 * kitöltött sáv. A minimum nem léphet a maximum fölé, és fordítva.
 */
export default function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  min: number;
  max: number;
  step: number;
  value: { min: number; max: number };
  onChange: (next: { min: number; max: number }) => void;
  format: (n: number) => string;
}) {
  const percent = (n: number) => ((n - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between font-mono text-[11px] text-[var(--muted)]">
        <span>{format(value.min)}</span>
        <span>{format(value.max)}</span>
      </div>
      <div className="relative h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded bg-[var(--border)]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-blue-500"
          style={{
            left: `${percent(value.min)}%`,
            right: `${100 - percent(value.max)}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value.min}
          onChange={(event) =>
            onChange({
              min: Math.min(Number(event.target.value), value.max),
              max: value.max,
            })
          }
          className={THUMB}
          aria-label="Minimum"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value.max}
          onChange={(event) =>
            onChange({
              min: value.min,
              max: Math.max(Number(event.target.value), value.min),
            })
          }
          className={THUMB}
          aria-label="Maximum"
        />
      </div>
    </div>
  );
}
