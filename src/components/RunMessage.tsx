import Link from "next/link";

/**
 * A futtató sávok üzenete. Tájékoztatásnál egy borostyán sor; hibánál piros
 * doboz az utolsó hiba szövegével és egy link az Élő naplóra, az adott futás
 * naplóterére és a figyelmeztetésekre szűrve — ott van a részlet.
 */
export default function RunMessage({
  status,
  message,
  scope,
}: {
  status: string;
  message: string | null | undefined;
  /** A szerveroldali napló hatóköre (`createLogger("…")`). */
  scope: string;
}) {
  if (status === "error") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-500/50 bg-red-500/10 px-2.5 py-2 text-xs text-red-200"
      >
        <span className="font-medium">Hiba:</span>{" "}
        {message || "a futás megállt — a részlet a naplóban van."}{" "}
        <Link
          href={`/debug?scope=${encodeURIComponent(scope)}&level=warn`}
          target="_blank"
          className="whitespace-nowrap underline underline-offset-2 hover:text-red-100"
        >
          Napló megnyitása ↗
        </Link>
      </div>
    );
  }
  return message ? <p className="text-xs text-amber-300">{message}</p> : null;
}
