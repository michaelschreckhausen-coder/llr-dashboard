---
description: Release develop → main (production). Requires explicit confirmation in chat — does NOT push autonomously.
---

Release flow `develop` → `main`. This is a deliberate, gated operation — never autonomous.

Step 1 — show me the release scope:
```bash
git fetch origin
git log --oneline --no-merges origin/main..origin/develop
git diff --stat origin/main..origin/develop
```

Step 2 — pre-flight checks. Confirm the following with me explicitly:
1. Wurde auf `staging.leadesk.de` getestet? (Hard-Refresh + Browser-Konsole)
2. Sind alle DB-Migrations (die in den Commits oben referenziert sind) bereits auf der **Prod-DB (Cloud)** angewendet? Prüfe in `supabase/migrations/` welche Files seit dem letzten main-Commit dazugekommen sind.
3. Gibt es ungelöste Issues vom anderen Dev (Julian)? → `app.leadesk.de/admin-logs` checken.
4. Stimmt die nächste Versionsnummer für den Changelog?

Frag mich zu jedem Punkt einzeln. Erst nach **expliziter Bestätigung "ja, mergen"**, fahre fort.

Step 3 — execute the merge:
```bash
git checkout main
git pull origin main
git merge develop --no-ff -m "merge: develop → main (release X.Y.Z)"
git push origin main
git checkout develop
```

Step 4 — post-release:
- Vercel build für `app.leadesk.de` abwarten (~30-45s)
- Mich zur Verifikation mit Hard-Refresh auffordern
- Changelog-Eintrag auf `app.leadesk.de/admin-logs` finalisieren (Status auf „released" o.ä.)

Falls beim Pre-Flight irgendetwas unklar ist oder ich „nein" / „warte" sage: brich ab, kein Push.
