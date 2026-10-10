#!/bin/sh
set -eu
task_release=/opt/guitar-room/releases/20261010-v1
task_source=/opt/guitar-room/source/20261010-v1
test -f "$task_release/server.js"
test ! -e /opt/guitar-room/current
test ! -e /etc/systemd/system/guitar-room.service
test ! -e /etc/nginx/conf.d/guitar-room.conf
if getent passwd guitar-room >/dev/null; then
    echo 'A guitar-room user already exists; inspect before activation.' >&2
    exit 1
fi
useradd --system --home-dir /var/lib/guitar-room --no-create-home --shell /usr/sbin/nologin guitar-room
ln -s "$task_release" /opt/guitar-room/current
install -m 0644 "$task_source/deploy/guitar-room.service" /etc/systemd/system/guitar-room.service
systemctl daemon-reload
systemctl enable --now guitar-room.service
task_ready=0
for task_attempt in 1 2 3 4 5; do
    if curl --fail --silent http://127.0.0.1:3100/api/bookings >/dev/null; then
        task_ready=1
        break
    fi
    sleep 1
done
test "$task_ready" -eq 1
install -m 0644 "$task_source/deploy/nginx-http.conf" /etc/nginx/conf.d/guitar-room.conf
if nginx -t; then
    systemctl reload nginx
else
    mv /etc/nginx/conf.d/guitar-room.conf /etc/nginx/conf.d/guitar-room.conf.disabled-20261010-v1
    exit 1
fi
echo GUITAR_HTTP_READY
