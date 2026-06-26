#!/usr/bin/env bash
# Build real Debian i386 rootfs for v86 and install into assets/debian/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${BUILD_DIR:-/tmp/v86-debian-build}"
COMMIT="866a6acbcfeaaee4235193191c4747c12d143123"
DEST="$ROOT/assets/debian"

echo "==> Preparing v86 debian build tree at $BUILD_DIR"
if [[ ! -d "$BUILD_DIR/.git" ]]; then
  git clone --filter=blob:none --no-checkout https://github.com/copy/v86.git "$BUILD_DIR"
fi

cd "$BUILD_DIR"
git fetch --depth 1 origin "$COMMIT" 2>/dev/null || true
git checkout "$COMMIT" -- tools/docker/debian tools/fs2json.py tools/copy-to-sha256.py 2>/dev/null || \
  git checkout "$COMMIT" -- tools/docker/debian tools/fs2json.py tools/copy-to-sha256.py

# Buster moved to archive.debian.org
DOCKERFILE="$BUILD_DIR/tools/docker/debian/Dockerfile"
if ! grep -q archive.debian.org "$DOCKERFILE"; then
  sed -i 's|ENV DEBIAN_FRONTEND noninteractive|ENV DEBIAN_FRONTEND=noninteractive|' "$DOCKERFILE"
  sed -i '/^RUN apt update/i\
RUN sed -i -re '\''s|http://deb.debian.org/debian|http://archive.debian.org/debian|g'\'' /etc/apt/sources.list \&\& \\\
    sed -i -re '\''s|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g'\'' /etc/apt/sources.list \&\& \\\
    sed -i '\''/buster-updates/d'\'' /etc/apt/sources.list \&\& \\' "$DOCKERFILE"
fi

echo "==> Building Debian rootfs (Docker, ~15–30 min)…"
cd "$BUILD_DIR/tools/docker/debian"
./build-container.sh

echo "==> Installing assets to $DEST"
mkdir -p "$DEST"
cp "$BUILD_DIR/images/debian-base-fs.json" "$DEST/"
rm -rf "$DEST/debian-9p-rootfs-flat"
cp -a "$BUILD_DIR/images/debian-9p-rootfs-flat" "$DEST/"

if [[ -f "$BUILD_DIR/images/debian-state-base.bin" ]]; then
  cp "$BUILD_DIR/images/debian-state-base.bin" "$DEST/"
  echo "    (includes saved state for fast boot)"
else
  echo "    (no state image — first browser boot will be slower)"
  echo "    To create state: run build-state.js from v86 after 'make all'"
fi

echo "==> Done. Debian assets installed."
du -sh "$DEST"
