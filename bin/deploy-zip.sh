#!/usr/bin/env sh
# Create a clean deploy zip for the آقای ناظر Bale bot (Linux/macOS).
# Usage: sh bin/deploy-zip.sh [output.zip] [--include-tests]
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/ahmad-agent-deploy.zip}"
INCLUDE_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --include-tests) INCLUDE_TESTS=1 ;;
  esac
done

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ahmad-deploy-XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

# PHP lint src (if php available)
if command -v php >/dev/null 2>&1; then
  for f in $(find "$ROOT/src" -name '*.php' -type f); do
    php -l "$f" >/dev/null
  done
  echo "PHP lint passed (src)."
else
  echo "Warning: php not found — skipping lint." >&2
fi

# Copy allow-listed items, pruning secrets / data / vcs
copy_item() {
  src="$ROOT/$1"
  [ -e "$src" ] || { echo "Skipping missing: $1" >&2; return; }
  if [ -f "$src" ]; then
    case "$src" in
      *.sqlite|*.db|*.log|*.zip) return ;;
    esac
    mkdir -p "$STAGE/$(dirname "$1")"
    cp "$src" "$STAGE/$1"
  else
    mkdir -p "$STAGE/$1"
    (cd "$src" && find . -type f \( -name '*.sqlite' -o -name '*.db' -o -name '*.log' -o -name '*.zip' \) -prune -o -type f -print -o -type d -print) | \
    while IFS= read -r rel; do
      case "$rel" in
        *"/.git"*|*".claude"*|*".aider"*|*"./data"*|*"/data"*) continue ;;
      esac
      if [ -d "$src/$rel" ]; then
        mkdir -p "$STAGE/$1/$rel"
      else
        mkdir -p "$STAGE/$1/$(dirname "$rel")"
        cp "$src/$rel" "$STAGE/$1/$rel"
      fi
    done
  fi
}

for item in src bin public dashboard config.php .env.example README.md DEPLOY.md "Start Ahmad.bat" docs; do
  copy_item "$item"
done
[ "$INCLUDE_TESTS" = "1" ] && copy_item tests

# Never ship .env or data/
rm -f "$STAGE/.env"
rm -rf "$STAGE/data"

rm -f "$OUT"
if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE" && zip -qr "$OUT" . -x '*/.git/*' '*.sqlite' '*.db' '*.log' '*.zip')
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$STAGE" "$OUT" <<'PY'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(stage):
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            z.write(full, os.path.relpath(full, stage))
PY
else
  echo "Error: zip or python3 required to create the archive." >&2
  exit 1
fi

size=$(du -h "$OUT" | cut -f1)
echo ""
echo "Created deploy zip:"
echo "  $OUT ($size)"
echo ""
echo "On the server:"
echo "  unzip '$OUT' -d . && cd . && cp .env.example .env   # fill BALE_TOKEN etc."
echo "  php bin/poll.php"
echo "  php bin/image-worker.php"
echo "  php bin/image-worker.php 2"
echo ""
echo "Contents:"
if command -v unzip >/dev/null 2>&1; then unzip -l "$OUT"; else python3 -c "import zipfile,sys; [print('  '+n) for n in zipfile.ZipFile(sys.argv[1]).namelist()]" "$OUT"; fi
