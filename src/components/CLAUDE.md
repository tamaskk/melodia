# Frontend (React 19 · Next 16 · Tailwind 4)

Kliens komponensek. A szerverrel csak `fetch`-en át beszélnek, `/api/*`-ra.

## Amit a fordító nem fog elkapni

- **Effekt törzsében nincs `setState`** (`react-hooks/set-state-in-effect`).
  Ha kezdőérték kell, add a `useState`-nek; ha eseményre reagálsz, tedd a
  kezelőbe; ha időzítőre, tedd a timerbe.
- **Refet ne állíts állapotfrissítőn belül**: fejlesztői módban kétszer fut,
  a második lefutás a sajátját látja. A számítást tedd a frissítőn kívülre.
- **A szülőtől kapott inline függvény minden rendernél új.** Ha effekt
  függősége, végtelen kör lesz belőle. Refbe tenni és onnan hívni, vagy
  `useCallback` a szülőben.
- Lista-lekérés csak lapozva; a szerver adja a `total`-t, nem itt számoljuk.
- Elavult válasz ne írja felül a frisset: kérés-azonosító vagy `AbortController`.

## Stílus

- Tailwind osztályok, CSS-változós színek (`var(--border)`, `var(--surface)`).
- Felületi szöveg magyarul, kód angolul.
- Új komponens akkor, ha kétszer kell ugyanaz — előbb ne.
