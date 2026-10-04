#!/usr/bin/env bash
# PostToolUse · Edit|Write
#
# Soha többé nem kérem meg, hogy formázzon. Ez nem instrukció, hanem
# automatizmus: a szerkesztés után lefut, akkor is, ha az agent elfelejtette.
# Nem blokkol semmit — a PostToolUse úgysem tud visszacsinálni semmit.
set -uo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"
[[ -z "$file" || ! -f "$file" ]] && exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.scss|*.md|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac

# --no-install: ha a projektben nincs prettier/eslint, csendben kihagyjuk.
npx --no-install prettier --write "$file" >/dev/null 2>&1

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    npx --no-install eslint --fix "$file" >/dev/null 2>&1
    ;;
esac

exit 0
