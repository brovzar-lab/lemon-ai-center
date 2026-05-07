#!/bin/bash
# Obsidian Brain vault sync — auto-commit, pull (picks up Railway decisions), and push
# Run by launchd every 30 minutes

VAULT_DIR="/Users/quantumcode/CODE/OBSIDIAN BRAIN"
LOGFILE="/tmp/vault-sync.log"

cd "$VAULT_DIR" || exit 1

echo "[$(date)] Starting vault sync" >> "$LOGFILE"

# Pull first to get decisions pushed by Railway
git pull --rebase --quiet 2>> "$LOGFILE"

# Stage all changes (new notes, edits, etc.)
git add -A 2>> "$LOGFILE"

# Only commit if there are changes
if ! git diff --cached --quiet; then
  git commit -m "vault sync $(date +%Y-%m-%d_%H:%M)" 2>> "$LOGFILE"
  git push --quiet 2>> "$LOGFILE"
  echo "[$(date)] Pushed vault changes" >> "$LOGFILE"
else
  echo "[$(date)] No changes to commit" >> "$LOGFILE"
fi

# Keep log from growing forever (last 200 lines)
tail -200 "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
