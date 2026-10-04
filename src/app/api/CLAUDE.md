# API route-ok (Next App Router)

Vékony réteg: kérés beolvasása, hívás a `src/lib`-be, válasz. Üzleti logika
itt nincs.

- `export const dynamic = "force-dynamic";` minden adatot olvasó útvonalon.
- Hiba: `NextResponse.json({ error: "…" }, { status: 4xx/5xx })`, magyar,
  cselekvésre utasító üzenettel.
- A bemenetet ellenőrizd (`Number.isFinite`, tartomány, tömb-e), ne bízz a
  kliensben.
- `maxDuration`: Vercel Hobby csomagon legfeljebb 300 — nagyobb érték a
  telepítést bukja meg.
- Háttérmunka (kiküldés, IMAP): a szerver folyamatában él, a válasz nem várja
  meg. Serverlessen ez nem működik — az őrfeltételt (`process.env.VERCEL`) ne
  vedd ki.
