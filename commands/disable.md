---
description: Disable cli-hud statusline and restore native display
allowed-tools: Bash, Read, Edit
---

Disable cli-hud and restore Claude Code's native statusline.

## Steps

1. Run the disable command:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/src/index.ts" disable
```

2. Tell the user:

> cli-hud disabled. **Please restart Claude Code** to restore the native statusline.
>
> To re-enable, run `/cli-hud:enable`.
