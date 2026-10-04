#!/usr/bin/env bash
# SessionStart · matcher: compact|resume
#
# Tömörítés után a nüánszok elvesznek: a hosszú sessionök minőségromlásának ez
# a leggyakoribb oka. A SessionStart hook stdoutja egyenesen a kontextusba
# kerül, tehát itt visszainjektáljuk azt a néhány szabályt, ami nem veszhet el.
set -uo pipefail
cat <<'TXT'
[harness] A tömörítés után is érvényes alapszabályok:
- Bizonyítékot mutass, ne állítsd a sikert: parancs + kimenet, ne "lefuttattam, jó".
- A kör végén zöld typecheck és lint kell (a Stop hook ezt kikényszeríti).
- Titkok (.env, atlas-credentials.env), lockfile, migrációk: nem szerkeszthetők.
- Ha ugyanazt kétszer kellett javítani, állj meg és jelezd — nem a harmadik
  javítás kell, hanem tiszta lap és jobb kiindulás.
- A docs/SPEC.md a hatókör. Ami nincs benne, azt kérdezd meg, ne találd ki.
TXT
exit 0
