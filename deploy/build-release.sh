#!/bin/sh
set -eu
umask 022
task_version=20261010-v1
task_source=/opt/guitar-room/source/$task_version
task_release=/opt/guitar-room/releases/$task_version
task_archive=/tmp/guitar-room-source-$task_version.tar.gz

test ! -e "$task_source"
test ! -e "$task_release"
install -d -m 0755 /opt/guitar-room/source /opt/guitar-room/releases
install -d -m 0755 "$task_source" "$task_release"
tar --no-same-permissions -xzf "$task_archive" -C "$task_source"
cd "$task_source"
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS=--max-old-space-size=768
npm ci --include=dev --no-audit --no-fund
NODE_ENV=production npm run build
cp -a .next/standalone/. "$task_release/"
install -d -m 0755 "$task_release/.next/static"
cp -a .next/static/. "$task_release/.next/static/"
chmod -R go-w "$task_source" "$task_release"
test -f "$task_release/server.js"
echo "GUITAR_RELEASE_READY=$task_release"
