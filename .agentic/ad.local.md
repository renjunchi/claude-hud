---
version: 2
git:
  default_branch: main
  develop_branch: ''
  release_branch: ''
branch:
  feature_template: feature/{feature}/{issue_id}-{short_desc}
  bugfix_template: bugfix/{issue_id}-{short_desc}
  hotfix_template: hotfix/{issue_id}-{short_desc}
worktree:
  enabled: true
  base_dir: .worktrees
adapter:
  provider: gitlab
  backend: auto
plugin_version: 2.8.1
---

# AD 配置说明

此文件包含 agentic-dev skills 的项目级配置。

## Adapter 配置

- `adapter.provider`: GitLab 或 GitHub
- `adapter.backend`: API 调用方式
  - `auto`: 自动检测（优先 CLI，降级到 API Token）
  - `cli`: 始终使用 glab/gh CLI
  - `api`: 始终使用 REST API（需设置 GITLAB_TOKEN/GITHUB_TOKEN）
