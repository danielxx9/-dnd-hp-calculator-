#!/usr/bin/env bash
set -euo pipefail
npx wrangler pages deploy . --project-name=dnd-hp-calculator --branch=main
echo "Deployed. Check: https://dnd-hp-calculator.pages.dev"
