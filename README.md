# scripting-scripts

Private monorepo for Scripting app projects maintained locally with agent assistance.

## Tracked projects

- `镜花水月`
- `和风天气`
- `快递小助手`
- `Github规则更新`
- `panel`
- `CLS Telegraph`
- `Colorful Clouds`
- `书源阅读`
- `Pickup Code`
- `Launch`
- `中國聯通`
- `项目历史管理器`
- `私有脚本仓库同步`

This repository contains controlled copies of the maintained projects. The live Scripting projects remain under the Scripting iCloud `scripts/` directory.

## Version policy

- `script.json.version` is the release version source of truth.
- Routine internal changes do not automatically bump versions.
- Release tags use `vX.Y.Z` and must match `script.json.version`.
- `remoteResource.hash` is managed by Scripting and is not edited as a release version.

## Workflow

1. Back up an existing live project with `project-auto-backup` before editing.
2. Validate the target Scripting entry with diagnostics and focused runtime checks.
3. Sync the changed project into this repository and inspect the diff.
4. Run `私有脚本仓库同步` to upload and verify the controlled copy.
5. Confirm the private remote contents and repository visibility.

Secrets, local configuration, temporary files, generated output, dependencies, and caches must not be committed.
