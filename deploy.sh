#!/usr/bin/env bash
# ── Botkeep Deploy Script ──
# Builds the project, cleans old files, and packages a zip for upload.
# Usage:
#   bash deploy.sh            # full deploy zip
#   bash deploy.sh --src-only  # src + dist only (no node_modules)
#   bash deploy.sh --dist-only # just dist/ (fastest for quick updates)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-full}"

echo "━━━ Ahmad Bot Deploy ━━━"
echo "Mode: $MODE"
echo ""

# ── 1. Build ──
echo "▸ Building TypeScript..."
npm run build 2>&1 | tail -2
echo "✓ Build complete"
echo ""

# ── 2. Clean stale deleted files ──
if [ -f "dist/useCases/nameCheckIn.js" ]; then
  echo "▸ Removing stale deleted files from dist/..."
  rm -f dist/useCases/nameCheckIn.js
  echo "✓ Stale files cleaned"
fi

# ── 3. Create zip ──
ZIP_NAME="ahmad-deploy-$(date +%Y%m%d-%H%M%S).zip"

case "$MODE" in
  --dist-only)
    echo "▸ Packaging dist/ only..."
    zip -r "$ZIP_NAME" dist/ dashboard/ package.json >/dev/null 2>&1 || \
    tar -czf "deploy.tar.gz" dist/ dashboard/ package.json
    if command -v zip >/dev/null 2>&1; then
      echo "✓ Created $ZIP_NAME"
    else
      echo "✓ Created deploy.tar.gz"
      ZIP_NAME="deploy.tar.gz"
    fi
    ;;
  --src-only)
    echo "▸ Packaging source + dist..."
    zip -r "$ZIP_NAME" \
      src/ dist/ dashboard/ \
      package.json tsconfig.json .env.example \
      -x "src/useCases/nameCheckIn.ts" >/dev/null 2>&1
    echo "✓ Created $ZIP_NAME"
    ;;
  full)
    echo "▸ Packaging full project..."
    zip -r "$ZIP_NAME" \
      src/ dist/ dashboard/ \
      package.json tsconfig.json .env.example \
      -x "src/useCases/nameCheckIn.ts" >/dev/null 2>&1
    echo "✓ Created $ZIP_NAME"
    ;;
  *)
    echo "Unknown mode: $MODE (use --dist-only, --src-only, or nothing for full)"
    exit 1
    ;;
esac

echo ""
echo "━━━ Upload Instructions ━━━"
echo "1. Go to https://botkeep.cloud → your bot → File Manager"
echo "2. Delete these old files (if they exist):"
echo "   - src/useCases/nameCheckIn.ts"
echo "   - dist/useCases/nameCheckIn.js"
echo "3. Upload + extract $ZIP_NAME to the project root"
echo "   (or upload individual folders: dist/, dashboard/, src/)"
echo "4. Restart the server in Botkeep"
echo ""
echo "Done! File: $ZIP_NAME"
