# Rename Boundary Matrix

This contract freezes the boundary for the global product rename from `QuickNav` to `AI Shortcuts`.

## Contract Decisions

- Product-level naming must use `AI Shortcuts` (deep/full scope).
- `QuickNav` is preserved only for module/sub-feature semantics.
- Hard cut policy: no alias bridge for renamed product-level namespaces.
- Data policy: pre-rename product-level data can be deleted after cutover.

## Must Rename

Product-level labels, product-level runtime naming, and explicitly reclassified infra paths must move away from `QuickNav`.

| Rule ID | Boundary Type | Example Anchors | Decision |
| --- | --- | --- | --- |
| MR-UI-POPUP | Product UI label | `popup/popup.html:6`, `popup/popup.html:14` | Must Rename |
| MR-BOOTSTRAP-LABEL | Product bootstrap label/comment | `content/bootstrap.js:1`, `content/bootstrap.js:358` | Must Rename |
| MR-INFRA-BRIDGE | Reclassified global infra path | `content/aishortcuts-bridge.js`, `content/aishortcuts-bridge-main.js` | Must Rename |
| MR-INFRA-SCOPE | Reclassified global infra path | `content/aishortcuts-scope.js`, `content/aishortcuts-scope-main.js` | Must Rename |
| MR-INFRA-KERNEL | Reclassified global infra path | `content/aishortcuts-kernel/*.js` | Must Rename |

## Must Keep

QuickNav module semantics stay as `QuickNav`/`quicknav` unless explicitly reclassified.

| Rule ID | Boundary Type | Example Anchors | Decision |
| --- | --- | --- | --- |
| MK-MODULE-ID | QuickNav module id contract | `shared/injections.ts:194`, `options/module-settings/core.js:6`, `content/chatgpt-quicknav.js:933` | Must Keep |
| MK-MODULE-LABEL | QuickNav module setting label | `options/options.js:1259` (`启用 QuickNav 模块`) | Must Keep |
| MK-MODULE-FILES | Module file naming semantics | `content/*-quicknav.js` (10 site files) | Must Keep |
| MK-MENU-API | Shared module API key | `content/menu-bridge.js:10` (`window.__quicknavRegisterMenuCommand`) | Must Keep |

Rule of thumb: `quicknav` in module id/file/module-local semantics is Must Keep by default.

## Ambiguous (Resolved)

These cases were ambiguous and are now explicitly resolved to avoid accidental over-rename or under-rename.

| Case | Why Ambiguous | Resolution |
| --- | --- | --- |
| `content/aishortcuts-bridge*.js`, `content/aishortcuts-scope*.js`, `content/aishortcuts-kernel/*` | Files are cross-module infrastructure instead of module-local feature scripts | Reclassified to Must Rename (product-level infra naming) |
| `window.__quicknavRegisterMenuCommand` | API is used across modules, but semantic purpose is the QuickNav module command bridge | Must Keep |
| Product-facing `QuickNav` labels inside popup/dev surfaces | String token overlaps with module name and can be mistaken as module-semantic text | Must Rename when the label identifies the product, page title, or product/dev surface |

## Enforcement Notes

- Product-level UI/dev labels that contain `QuickNav` are always treated as Must Rename.
- Module id and module file semantics that use `quicknav` are treated as Must Keep unless this matrix explicitly reclassifies them.
