#!/usr/bin/env bash
# Stop · az ellenőrzési kapu
#
# "Az agent akkor áll meg, amikor késznek látszik." Ez a hook az, ami miatt el
# lehet menni ebédelni futó feladat mellől: amíg a typecheck / lint / teszt nem
# zöld, nem fejezheti be a kört.
#
# Fontos: a stop_hook_active mezőt figyelni kell, különben végtelen körbe fut.
set -uo pipefail

input="$(cat)"
if [[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" == "true" ]]; then
  # Már egy blokkolt kör folytatása vagyunk — nem blokkolunk újra.
  exit 0
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
source "$root/.claude/hooks/lib.sh"

# Ha semmi kódot nem érintettünk, nincs mit ellenőrizni: ne büntessük a
# kérdés-válasz köröket egy 20 másodperces typecheckkel.
changed="$(git -C "$root" status --porcelain 2>/dev/null | grep -cE '\.(ts|tsx|js|jsx|mjs|cjs)$' || true)"
[[ "${changed:-0}" -eq 0 ]] && exit 0

fail() {
  {
    echo "A kör nem zárható le: $1 hibás."
    echo
    echo "$2" | tail -40
    echo
    echo "Javítsd a hibát, ne nyomd el. Ha a hiba nem a mostani munkához"
    echo "tartozik, mondd ki, és kérdezd meg a felhasználót, mi legyen vele."
  } >&2
  exit 2
}

for step in typecheck lint; do
  if has_script "$root" "$step"; then
    if ! out="$(run_script "$root" "$step" 2>&1)"; then
      fail "$step" "$out"
    fi
  fi
done

if has_script "$root" "test"; then
  if ! out="$(run_script "$root" "test" 2>&1)"; then
    fail "teszt" "$out"
  fi
fi

exit 0
