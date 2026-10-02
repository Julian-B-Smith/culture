#!/usr/bin/env bash
# Stop / SubagentStop: the harness's closing gate.
# Blocks (exit 2) if: files were edited but verify hasn't run since (dirty),
# or the last verify run was red. stderr is fed back to Claude as instructions.
set -uo pipefail

INPUT=$(cat)
# Prevent infinite loops: if we already blocked once this stop cycle, allow.
ACTIVE=$(printf '%s' "$INPUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("stop_hook_active",False))' 2>/dev/null || echo "False")
[ "$ACTIVE" = "True" ] && exit 0

if [ -f .harness/dirty ]; then
  echo "Harness gate: edits exist that have not been verified. Run ./verify fast (or full, if closing a queue item) and report the output verbatim before finishing." >&2
  exit 2
fi

if [ -f .harness/last-verify.json ]; then
  EXIT=$(python3 -c 'import json; print(json.load(open(".harness/last-verify.json")).get("exit",0))' 2>/dev/null || echo 0)
  if [ "$EXIT" != "0" ]; then
    echo "Harness gate: last oracle run was RED (./verify report). Fix or revert before finishing; do not end on red. If the failure is out of scope, say so explicitly and record it as an open question." >&2
    exit 2
  fi
fi
exit 0
