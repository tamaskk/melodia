#!/usr/bin/env bash
# PreToolUse · Bash
#
# Ugyanaz a védelem, shell oldalról. A fájlvédelem semmit nem ér, ha a
# tiltott fájlt egy `cat > .env` megkerüli.
set -uo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
[[ -z "$cmd" ]] && exit 0

deny() {
  echo "BLOKKOLVA: $1" >&2
  echo "Parancs: $cmd" >&2
  echo "Ha ez tényleg szükséges, kérd meg a felhasználót, hogy futtassa ő." >&2
  exit 2
}

# Visszafordíthatatlan, vagy idegen gépen is kárt okoz.
# Csak a REKURZÍV törlés tilos abszolút útvonalon: egy `rm -f <fájl>` rendben
# van, és a mintába sem szabad belevenni, mert vak riasztást ad.
[[ "$cmd" =~ rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*[[:space:]]+)+/ ]] && deny "rekurzív törlés abszolút útvonalon"
[[ "$cmd" =~ rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f|rm[[:space:]]+-[a-zA-Z]*f[a-zA-Z]*r ]] && deny "rm -rf"
[[ "$cmd" =~ git[[:space:]]+push.*--force([^-]|$) ]] && deny "erőltetett push — átírja mások előzményét"
[[ "$cmd" =~ git[[:space:]]+push.*-f([[:space:]]|$) ]] && deny "erőltetett push"
[[ "$cmd" =~ git[[:space:]]+reset[[:space:]]+--hard ]] && deny "git reset --hard — a nem commitolt munka elvész"
[[ "$cmd" =~ git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f ]] && deny "git clean -f — a nem követett fájlok elvesznek"
[[ "$cmd" =~ git[[:space:]]+checkout[[:space:]]+--[[:space:]]+\. ]] && deny "minden helyi változtatás eldobása"
[[ "$cmd" =~ (dropDatabase|dropCollection|db\.dropDatabase) ]] && deny "adatbázis eldobása"
[[ "$cmd" =~ chmod[[:space:]]+(-R[[:space:]]+)?777 ]] && deny "chmod 777"
[[ "$cmd" =~ (curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba)?sh ]] && deny "letöltött script futtatása"
[[ "$cmd" =~ (cat|tee|printf|echo)[^|]*\>[[:space:]]*\.?(env|atlas-credentials\.env) ]] && deny "titkos fájl felülírása shellből"
[[ "$cmd" =~ ^[[:space:]]*sudo ]] && deny "sudo — rendszerszintű változtatás"

exit 0
