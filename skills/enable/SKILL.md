---
name: enable
description: Enable claude-hud statusline
allowed-tools: Bash, Read, Edit
---

Enable claude-hud as the Claude Code statusline.

## Steps

1. Run the enable command:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/src/index.ts" enable
```

2. Tell the user:

> claude-hud enabled. **Please restart Claude Code** to see the HUD.
