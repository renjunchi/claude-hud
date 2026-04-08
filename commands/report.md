---
description: Generate HTML usage report with charts and session history
allowed-tools: Bash
---

Generate a claude-hud HTML report and open in browser.

## Steps

1. Run the report command:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/src/index.ts" report
```

2. Tell the user the report has been generated and opened in the browser.
