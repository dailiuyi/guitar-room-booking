#!/bin/sh
set -eu
task_source=/opt/guitar-room/source/20261010-v1
task_config=/etc/nginx/conf.d/guitar-room.conf
task_backup=/opt/guitar-room/nginx-http.before-https.conf
test -f /etc/letsencrypt/live/guitar.elma-gohan.xyz/fullchain.pem
cmp -s "$task_source/deploy/nginx-http.conf" "$task_config"
test ! -e "$task_backup"
cp -p "$task_config" "$task_backup"
install -m 0644 "$task_source/deploy/nginx-https.conf" "$task_config"
if nginx -t; then
    systemctl reload nginx
else
    cp -p "$task_backup" "$task_config"
    exit 1
fi
echo GUITAR_HTTPS_READY
