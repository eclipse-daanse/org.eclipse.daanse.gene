#!/usr/bin/env bash
# Takes the Atlas management model 1:1 from eclipse-fennec/model.atlas.
#
# gene used to keep adapted copies (timestamps as EString, no Java data types,
# no diagnostics). They drifted from the server and broke its answers. The
# model is now the original: this script fetches it, records where it came
# from in src/model/SOURCE, and nothing else touches it by hand.
#
# Usage: scripts/sync-management-model.sh [ref]   (default: snapshot)
# Afterwards: npm run generate:management
set -euo pipefail

REPO="eclipse-fennec/model.atlas"
FILE="org.eclipse.fennec.model.atlas.management/model/management.ecore"
REF="${1:-snapshot}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$HERE/src/model/management.ecore"

COMMIT="$(curl -fsSL "https://api.github.com/repos/$REPO/commits?sha=$REF&path=$FILE&per_page=1" \
  | sed -n 's/^    "sha": "\([0-9a-f]\{40\}\)".*/\1/p' | head -1)"
if [ -z "$COMMIT" ]; then
  echo "Could not determine the commit of $FILE on $REF" >&2
  exit 1
fi

curl -fsSL "https://raw.githubusercontent.com/$REPO/$COMMIT/$FILE" -o "$TARGET"

cat > "$HERE/src/model/SOURCE" <<SRC
# The Atlas management model, taken 1:1 - do not edit management.ecore by hand.
# Update with scripts/sync-management-model.sh, then npm run generate:management.
repository: https://github.com/$REPO
path: $FILE
ref: $REF
commit: $COMMIT
SRC

echo "management.ecore <- $REPO@${COMMIT:0:7} ($REF)"
