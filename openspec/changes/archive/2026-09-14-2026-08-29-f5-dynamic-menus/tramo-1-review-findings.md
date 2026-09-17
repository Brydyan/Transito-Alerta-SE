# Review Findings: F5 Dynamic Menus (Tramo 1)

**Date**: 2026-09-14
**Scope**: `back/2026-08-29-f5-dynamic-menus` (Tramo 1 + F5.6 integration)
**Role**: Inspection and Architecture Review

This document outlines the findings from the review of Tramo 1. It serves as an actionable handoff for OpenCode to apply the necessary corrections.

## 1. Architectural Anti-Pattern: `parentId` Leak (Critical Action Required)

**Location**: `backend/src/modules/menus/menus.service.ts`

**Issue**: The `buildTree` method currently mutates the response DTO (`MenuEntry`) by injecting a `parentId` property. This violates the **D1** contract, as it leaks internal relational database implementation details into the public API response. While the frontend currently ignores this extra property, it creates dangerous coupling and prevents future refactoring of the tree-building strategy.

**Action for OpenCode**:
Refactor the `buildTree` method. Do not cast or extend `MenuEntry`. Instead, wrap the clean `MenuEntry` inside an internal mapping structure while building the hierarchy.

*Implementation Reference:*
```typescript
  private buildTree(options: MenuOptionEntity[]): MenuEntry[] {
    // 1. Isolate the DTO from the relational state using a wrapper
    const entryMap = new Map<string, { entry: MenuEntry; parentId: string | null }>();
    for (const opt of options) {
      const entry: MenuEntry = {
        label: opt.name,
        route: opt.route,
        order: opt.displayOrder,
        children: [],
      };
      if (opt.icon) {
        entry.icon = opt.icon;
      }
      entryMap.set(opt.id, { entry, parentId: opt.parentId });
    }

    // 2. Build relationships using the wrapper
    const roots: MenuEntry[] = [];
    for (const { entry, parentId } of entryMap.values()) {
      if (parentId && entryMap.has(parentId)) {
        entryMap.get(parentId)!.entry.children.push(entry);
      } else if (!parentId) {
        roots.push(entry);
      }
    }

    // 3. Sort cleanly
    const sortByOrder = (a: MenuEntry, b: MenuEntry) => a.order - b.order;
    const sortTree = (entries: MenuEntry[]): MenuEntry[] => {
      entries.sort(sortByOrder);
      for (const entry of entries) {
        if (entry.children.length > 0) {
          sortTree(entry.children);
        }
      }
      return entries;
    };

    return sortTree(roots);
  }
```

## 2. Testing Infrastructure: Testcontainers E2E Block (Action Required)

**Issue**: The backend E2E tests have not been executed because Testcontainers is failing under the local Podman configuration (socket mapping issue: `Ryuk vs /var/run/docker.sock`).
**Action**: This is an infrastructure issue that must be addressed locally. E2E tests cannot be bypassed before declaring the backend change ready for production.

## 3. Deployment: Pending Supabase Migrations (Action Required)

**Issue**: Migrations `0054` and `0055` have been successfully applied to the local Docker Postgres instance (`tase-postgres`) but are currently marked as `⏳ Pending` in Supabase.
**Action**: Ensure that these migrations are executed against the remote Supabase environments during the deployment phase.

## 4. Documentation Precision: `MENU_MAP` Entries (Informational)

**Issue**: The original task documentation approximated "eleven" entries in the `MENU_MAP`. The actual count migrated with specific routes is exactly **10**.
**Action**: No code changes required. Noted purely for historical ledger accuracy.
