#!/bin/bash
# Cleanup orphaned Chromium processes from whatsapp-indexer
for pid in $(pgrep -f "chrome.*wwebjs_auth"); do
  kill -9 "$pid" 2>/dev/null
done
rm -f /local/home/orrb/personal-workspace/Jarvis/whatsapp-indexer/.wwebjs_auth/session-whatsapp-indexer/SingletonLock
sleep 2
exit 0
