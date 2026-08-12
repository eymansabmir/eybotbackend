#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

# Optional: wipe + rebuild MS assistant knowledge vectors (slow; Xenova may download models).
# Enable only when you intentionally want a reindex: RUN_MS_KB_INGEST=true
case "${RUN_MS_KB_INGEST:-false}" in
  true|TRUE|1|yes|YES)
    echo "Running MS knowledge ingest (RUN_MS_KB_INGEST=${RUN_MS_KB_INGEST})..."
    node dist/cli/ingest-ms-knowledge.js
    ;;
  *)
    echo "Skipping MS knowledge ingest (set RUN_MS_KB_INGEST=true to run)."
    ;;
esac

echo "Starting application..."
exec "$@"
