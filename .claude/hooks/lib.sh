#!/usr/bin/env bash
# Közös segédek a hookoknak. Minden hook ezt olvassa be először.
#
# Két dolog van itt: a csomagkezelő kitalálása (a harness több projektben fut,
# nem mindegyikben npm van), és a "van-e ilyen script" kérdés — így ugyanaz a
# kapu működik teszt nélküli és teszttel dolgozó repóban is.

# A hook a projekt gyökeréből indul; ha mégsem, keressük meg.
root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

pkg_manager() {
  local dir="$1"
  if [[ -f "$dir/pnpm-lock.yaml" ]]; then echo "pnpm"
  elif [[ -f "$dir/yarn.lock" ]]; then echo "yarn"
  elif [[ -f "$dir/bun.lockb" ]]; then echo "bun"
  else echo "npm"; fi
}

# Van-e ilyen npm script a package.jsonban.
has_script() {
  local dir="$1" name="$2"
  [[ -f "$dir/package.json" ]] || return 1
  jq -e --arg n "$name" '.scripts[$n] // empty' "$dir/package.json" >/dev/null 2>&1
}

run_script() {
  local dir="$1" name="$2" pm
  pm="$(pkg_manager "$dir")"
  case "$pm" in
    npm) (cd "$dir" && npm run --silent "$name") ;;
    *)   (cd "$dir" && "$pm" run "$name") ;;
  esac
}
