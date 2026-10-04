#!/usr/bin/env bash
# PreToolUse · Edit|Write|MultiEdit|NotebookEdit
#
# Az egyetlen hiba, amit nem lehet visszacsinálni: elrontani valamit, amiről
# nem tudtam, hogy hozzányúlt. Ez a hook a szerkesztés ELŐTT áll meg — a
# PostToolUse már késő volna.
#
# Kilépési kód 2 = blokk, és a stderr az indoklás, amit az agent visszakap:
# ezért mondjuk meg azt is, mit csináljon helyette.
set -uo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"
[[ -z "$file" ]] && exit 0

# A projekt gyökeréhez képest nézzük, hogy a minták rövidek maradjanak.
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
rel="${file#"$root"/}"

block() {
  echo "BLOKKOLVA: $rel — $1" >&2
  echo "Ha tényleg kell, kérd meg a felhasználót, hogy ő szerkessze, vagy" >&2
  echo "beszéljétek meg előbb. Ne kerüld meg shell paranccsal." >&2
  exit 2
}

case "$rel" in
  .env|.env.*|*/.env|*/.env.*)        block "titkokat tartalmazó fájl" ;;
  atlas-credentials.env)              block "az összes hitelesítő adat egy helyen" ;;
  *.pem|*.key|*.p12|*id_rsa*)         block "kulcsfájl" ;;
  package-lock.json|pnpm-lock.yaml|yarn.lock|bun.lockb)
                                      block "lockfile — a csomagkezelő írja, ne kézzel" ;;
  .git/*)                             block "a git belső állapota" ;;
  */migrations/*|migrations/*|*/prisma/migrations/*)
                                      block "lefutott migráció — új migrációt írj helyette" ;;
  attachments/*)                      block "személyes dokumentumok mappája" ;;
  .claude/settings.local.json)        block "a felhasználó személyes beállításai" ;;
esac

exit 0
