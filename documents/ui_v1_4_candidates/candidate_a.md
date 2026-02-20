# Candidate A (ui-v1.4-a)

## 目标
- 让 `@vesti/ui` 在同仓库内可被 `frontend` 与 `vesti-web` 正常解析
- 统一 workspace 依赖路径，确保根目录安装依赖即可运行

## 改动
- 将 `@vesti/ui` 放入仓库内并启用 workspaces（基线分支完成）
- `frontend` / `vesti-web` 依赖路径改为 `file:../packages/vesti-ui`
- Tailwind 与样式扫描路径同步到仓库内 `packages/vesti-ui`
- 根目录安装依赖生成 `package-lock.json`

## 风险
- `frontend` 使用 React 18，而 `vesti-web` 使用 React 19，可能产生双版本依赖
- 根锁文件较大，后续需确认是否与团队依赖策略一致

## 结论
- 待运行验证（frontend / vesti-web）

## Commit / Tag
- base: `31da824` infra: add monorepo workspace and vesti ui package
- a: `4d67485` feat(frontend): add dashboard, tagging, and storage
- a: `0639aaf` chore(frontend): add plasmo config
- a: `62037dd` ui: alias dashboard shell import
- a: `1be8c4e` feat(web): add vesti-web prototype
- a: `b7e8ee9` infra(a): align workspace paths and lockfile
- tag: (待定)
