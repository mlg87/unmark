#!/bin/bash
# The epic closeout verifier's CLAUDE_CODE_SHELL_PREFIX: Claude Code runs every Bash tool command as
# `verifier-shell.sh '<command>'`, each in a process group of its own. A process the command leaves
# running in the background stays in that group after its shell exits and it is reparented, so
# recording the group is what lets epic-closeout.sh stop it (#115).
set -euo pipefail
ps -o pgid= -p $$ | tr -d ' ' >>"$EPIC_CLOSEOUT_PROCESS_GROUPS"
exec "$CLAUDE_CODE_SHELL" -c "$1"
