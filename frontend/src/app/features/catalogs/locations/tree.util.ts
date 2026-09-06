import { IGeoZone, GeoZoneLevel, IGeoZoneNode } from './interfaces/igeo-zone.interface';

/**
 * Pure tree helpers for the F2.3 Ubicaciones catalog. No Angular imports —
 * these are unit-testable in isolation.
 */

/**
 * Build a hierarchical tree from a flat list of geo zones (design D3).
 *
 * Two passes:
 * 1. Pass 1 links each node to its parent (building the parent->children
 *    structure via a Map).
 * 2. Pass 2 runs a top-down DFS from the roots to compute `depth` for every
 *    node.
 *
 * `depth` MUST NOT be assigned during the linking loop: it is only correct
 * there if parents happen to be visited before children, which cannot be
 * assumed with real data. Computing it with the post-construction DFS makes
 * it robust regardless of input ordering.
 */
export function buildTree(rows: IGeoZone[]): IGeoZoneNode[] {
  const byId = new Map<string, IGeoZoneNode>(
    rows.map((row) => [row.id, { ...row, children: [], depth: 0 }]),
  );

  const roots: IGeoZoneNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Pass 2: top-down DFS from roots, assigning deterministic depths.
  const stack: IGeoZoneNode[] = [...roots];
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
 * Filter a tree keeping every node that (a) matches the term, or (b) has a
 * descendant that matches (design D4). Ancestors of matches are preserved so
 * deep matches (e.g. a parroquia) do not lose their territorial context.
 *
 * The returned tree is a shallow copy of the filtered structure; untouched
 * nodes are shared by reference with the input.
 */
export function filterTreePreservingAncestors(tree: IGeoZoneNode[], term: string): IGeoZoneNode[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return tree;
  }

  const matches = (node: IGeoZoneNode): boolean => {
    return (
      node.name.toLowerCase().includes(normalized) ||
      (node.code !== null && node.code.toLowerCase().includes(normalized))
    );
  };

  const filterNode = (node: IGeoZoneNode): IGeoZoneNode | null => {
    const filteredChildren = node.children
      .map(filterNode)
      .filter((child): child is IGeoZoneNode => child !== null);
    const selfMatches = matches(node);
    if (selfMatches || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  };

  return tree.map(filterNode).filter((node): node is IGeoZoneNode => node !== null);
}

/**
 * The immediate parent level required for a given level, matching the
 * backend's REQUIRED_PARENT_LEVEL table (`geo-zones.service.ts`):
 *
 *   provincia -> null   (must have no parent)
 *   canton    -> 'provincia'
 *   parroquia -> 'canton'
 *   zona      -> '*'    (any parent level, or none)
 *
 * Returns the concrete parent level when this child must have a parent at a
 * single level, `'*'` for 'zona' (any level), or `null` when no parent is
 * allowed.
 */
export function getLevelParentLevel(level: GeoZoneLevel): GeoZoneLevel | '*' | null {
  switch (level) {
    case 'provincia':
      return null;
    case 'canton':
      return 'provincia';
    case 'parroquia':
      return 'canton';
    case 'zona':
      return '*';
  }
}
