#!/usr/bin/env bash
#
# Buddy Script — production workspace cleanup + dry-run build.
#
# Strips redundant, draft, and unmapped artifacts so the codebase is minimal
# and ready for ingestion by the Vercel dashboard. Safe to re-run.
#
# Usage: bash scripts/clean-production.sh
set -euo pipefail

# 1. Eliminate historical static flat files (legacy HTML draft pages).
#    These are unmapped relics from a pre-Next.js version and are not referenced
#    by the App Router. Harmless if absent.
rm -f login.html registration.html feed.html

# 2. Retain the mapped asset tree.
#    `assets/css/*` IS referenced by `app/globals.css` (via @import) and the
#    image cache in `public/assets/images/` is referenced by the pages, so both
#    are kept. Only unmapped relics above are removed.

# 3. Purge the Next.js build cache so the dry-run is fully clean.
rm -rf .next

# 4. Type-check, then run the production build (fail-fast on any error).
npx tsc --noEmit && npm run build

echo "Cleanup complete. Production build succeeded."
