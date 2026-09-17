import { IIncidentCategory } from './interfaces/iincident-category.interface';
import { IncidentCategoryNode } from './interfaces/iincident-category.interface';

/**
 * Pure tree helpers for the Incident Categories catalog. Mirrors
 * `locations/tree.util.ts` so the UX pattern stays identical: roots
 * rendered flat with chevron expand/collapse and indent for depth.
 *
 * No Angular imports — these are unit-testable in isolation.
 */

/**
 * Build a hierarchical tree from a flat list of categories.
 *
 * Two passes:
 *   1. Link each row to its parent via a Map lookup, populating the
 *      `children` arrays.
 *   2. Top-down DFS from the roots to assign deterministic `depth`.
 *
 * Computing `depth` in pass 2 (NOT during linking) is the same
 * robustness trick the geo-zones util uses — input order from the
 * backend cannot be assumed to be parent-first.
 */
export function buildCategoryTree(rows: IIncidentCategory[]): IncidentCategoryNode[] {
  const byId = new Map<string, IncidentCategoryNode>(
    rows.map((row) => [
      row.id,
      { ...row, children: [], depth: 0 },
    ]),
  );

  const roots: IncidentCategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Pass 2 — top-down DFS.
  const stack: IncidentCategoryNode[] = [...roots];
  for (const root of roots) {
    root.depth = 0;
  }
  for (let i = 0; i < stack.length; i++) {
    const node = stack[i];
    for (const child of node.children) {
      child.depth = node.depth + 1;
      stack.push(child);
    }
  }

  return roots;
}

/**
 * Filter the tree so that (a) every node matching the search term is
 * kept, and (b) every ancestor of a match is preserved so deep
 * matches keep their context. Returns a shallow copy of the filtered
 * tree.
 *
 * Search matches against `name` and `description` (case-insensitive).
 */
export function filterCategoryTreePreservingAncestors(
  tree: IncidentCategoryNode[],
  term: string,
): IncidentCategoryNode[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return tree;
  }

  const matches = (node: IncidentCategoryNode): boolean => {
    if (node.name.toLowerCase().includes(normalized)) {
      return true;
    }
    if (node.description && node.description.toLowerCase().includes(normalized)) {
      return true;
    }
    return false;
  };

  const filterNode = (node: IncidentCategoryNode): IncidentCategoryNode | null => {
    const filteredChildren = node.children
      .map(filterNode)
      .filter((child): child is IncidentCategoryNode => child !== null);
    const selfMatches = matches(node);
    if (selfMatches || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  };

  return tree
    .map(filterNode)
    .filter((node): node is IncidentCategoryNode => node !== null);
}