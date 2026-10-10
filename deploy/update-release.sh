#!/bin/sh
set -eu
umask 077
task_version=${1:?Pass the release version}
case "$task_version" in
    ''|*[!a-zA-Z0-9-]*) echo 'Invalid release version.' >&2; exit 2 ;;
esac
task_source=/opt/guitar-room/source/$task_version
task_release=/opt/guitar-room/releases/$task_version
task_database=/var/lib/guitar-room/bookings.sqlite
task_backup=/var/lib/guitar-room/backups/$task_version.sqlite
task_unit_backup=/var/lib/guitar-room/backups/$task_version.service
task_previous=$(readlink -f /opt/guitar-room/current)
task_next=/opt/guitar-room/current.next
test -f "$task_release/server.js"
test -f "$task_source/deploy/guitar-room.service"
test -f "$task_database"
test -f "$task_previous/server.js"
test ! -e "$task_backup"
test ! -e "$task_unit_backup"
test ! -e "$task_next"
install -d -m 0700 /var/lib/guitar-room/backups
cp /etc/systemd/system/guitar-room.service "$task_unit_backup"

# Keep administrator credentials on the server; never emit their value.
python3 - <<'PY'
import os, secrets
path = '/etc/guitar-room.env'
if not os.path.exists(path):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as target:
        target.write('ADMIN_CANCELLATION_KEY=' + secrets.token_hex(32) + '\n')
else:
    lines = open(path).read().splitlines()
    values = [line.partition('=')[2].strip().strip('"\'') for line in lines if line.startswith('ADMIN_CANCELLATION_KEY=')]
    if not values:
        with open(path, 'a') as target:
            target.write('\nADMIN_CANCELLATION_KEY=' + secrets.token_hex(32) + '\n')
    elif len(values) != 1 or not 32 <= len(values[0]) <= 256:
        raise SystemExit('Existing administrator key configuration needs correction before deployment.')
os.chown(path, 0, 0)
os.chmod(path, 0o600)
print('ADMIN_KEY_CONFIGURED')
PY

task_backup_ready=0
rollback() {
    task_status=$?
    trap - EXIT HUP INT TERM
    if [ "$task_status" -ne 0 ]; then
        systemctl stop guitar-room.service || true
        if [ "$task_backup_ready" -eq 1 ]; then
            python3 - "$task_backup" "$task_database" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as source, sqlite3.connect(sys.argv[2]) as target:
    source.backup(target)
PY
        fi
        ln -sfn "$task_previous" "$task_next"
        mv -Tf "$task_next" /opt/guitar-room/current
        cp "$task_unit_backup" /etc/systemd/system/guitar-room.service
        systemctl daemon-reload
        systemctl start guitar-room.service
        echo 'DEPLOYMENT_FAILED_OLD_RELEASE_RESTORED' >&2
    fi
    exit "$task_status"
}
trap rollback EXIT
trap 'exit 1' HUP INT TERM

# Stop writes before taking a consistent SQLite backup, including WAL contents.
systemctl stop guitar-room.service
python3 - "$task_database" "$task_backup" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as source, sqlite3.connect(sys.argv[2]) as target:
    source.backup(target)
    if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise SystemExit('Backup integrity check failed.')
print('DATABASE_BACKUP_VERIFIED')
PY
task_backup_ready=1
chmod 0600 "$task_backup" "$task_unit_backup"
ln -s "$task_release" "$task_next"
mv -Tf "$task_next" /opt/guitar-room/current
install -m 0644 "$task_source/deploy/guitar-room.service" /etc/systemd/system/guitar-room.service
systemctl daemon-reload
systemctl start guitar-room.service
task_ready=0
for task_attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl --fail --silent http://127.0.0.1:3100/api/bookings >/dev/null; then
        task_ready=1
        break
    fi
    if [ "$task_attempt" -eq 10 ]; then echo 'Service did not become ready.' >&2; fi
    sleep 1
done
test "$task_ready" -eq 1
systemctl is-active --quiet guitar-room.service
python3 - "$task_backup" "$task_database" <<'PY'
import sqlite3, sys, urllib.request, json
with sqlite3.connect(sys.argv[1]) as old, sqlite3.connect(sys.argv[2]) as current:
    columns = {row[1] for row in old.execute('PRAGMA table_info(bookings)')}
    slot = 'slot_start' if 'slot_start' in columns else "'20:00'"
    before = old.execute(f'SELECT booking_date, {slot}, name, cancellation_digest, created_at FROM bookings').fetchall()
    after = current.execute('SELECT booking_date, slot_start, name, cancellation_digest, created_at FROM bookings').fetchall()
    if not set(before).issubset(set(after)):
        raise SystemExit('Existing reservations were not preserved; rolling back.')
    if current.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise SystemExit('Database integrity check failed; rolling back.')
with urllib.request.urlopen('http://127.0.0.1:3100/api/bookings') as response:
    data = json.load(response)
if len(data.get('slots', [])) != 13 or data['slots'][0]['start'] != '08:00' or data['slots'][-1]['end'] != '21:00':
    raise SystemExit('Hourly schedule verification failed; rolling back.')
print('EXISTING_RESERVATIONS_PRESERVED=' + str(len(before)))
PY
trap - EXIT HUP INT TERM
echo "GUITAR_DEPLOYED=$task_release"
echo "DATABASE_BACKUP=$task_backup"
