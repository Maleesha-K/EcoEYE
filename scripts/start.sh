#!/bin/bash
echo "--- Starting EcoEYE ---"
echo "Current directory: $(pwd)"
echo "Files in /app:"
ls -F /app

# Ensure udev is started if requested
if [ "$UDEV" == "1" ]; then
    echo "Starting udev..."
    /lib/systemd/systemd-udevd --daemon
    udevadm trigger
fi

echo "Starting Gunicorn on port ${APP_PORT:-80}..."
exec gunicorn --bind 0.0.0.0:${APP_PORT:-80} --workers 1 --threads 8 --timeout 120 app:app
