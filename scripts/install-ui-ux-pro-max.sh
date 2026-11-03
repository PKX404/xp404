#!/usr/bin/env bash
# Run from the XParty repository root; installs the official design agent skill.
# Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT)
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js required"; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 required"; exit 1; }
npx --yes ui-ux-pro-max-cli@latest init --ai codex
test -f .agents/skills/ui-ux-pro-max/SKILL.md
python3 .agents/skills/ui-ux-pro-max/scripts/search.py \
  "mobile social video co-watching entertainment minimal dark" \
  --design-system -p XParty --motion 2 --density 7
echo "UI UX Pro Max installed for Codex; see design-system/xparty/MASTER.md."
