import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: Date;
  depth: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: Date;
  children: CategoryNode[];
}

/** Backstop against pathological data, not a product limit (spec). */
const MAX_DEPTH = 1000;

/**
 * IncidentCategoriesRepository (design D1) — raw recursive-CTE SQL for the
 * ONE thing TypeORM can't express cleanly: the subtree read. Mirrors
 * IncidentsRepository/GeofencingRepository's isolation + parameterization
 * convention (design D4 / CC1). Also owns the ancestor-walk cycle guard
 * (design D4), run against the same DataSource as the write.
 */
@Injectable()
export class IncidentCategoriesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Flat, depth-annotated rows for the subtree rooted at `rootId`, or every
   * root category (`parent_id IS NULL`) plus their full subtrees when
   * `rootId` is null — a single recursive CTE query.
   */
  /** T7.2.B2/C3 (R7.3) — soft-deleted categories are excluded at every level of the subtree. */
  async listFlat(rootId: string | null): Promise<CategoryRow[]> {
    if (rootId === null) {
      return this.dataSource.query(
        `WITH RECURSIVE subtree AS (
           SELECT id, name, parent_id, created_at, 0 AS depth
           FROM incident_categories
           WHERE parent_id IS NULL AND deleted_at IS NULL
           UNION ALL
           SELECT c.id, c.name, c.parent_id, c.created_at, s.depth + 1
           FROM incident_categories c
           INNER JOIN subtree s ON c.parent_id = s.id
           WHERE s.depth < ${MAX_DEPTH} AND c.deleted_at IS NULL
         )
         SELECT id, name, parent_id, created_at, depth FROM subtree`,
      );
    }

    return this.dataSource.query(
      `WITH RECURSIVE subtree AS (
         SELECT id, name, parent_id, created_at, 0 AS depth
         FROM incident_categories
         WHERE id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT c.id, c.name, c.parent_id, c.created_at, s.depth + 1
         FROM incident_categories c
         INNER JOIN subtree s ON c.parent_id = s.id
         WHERE s.depth < ${MAX_DEPTH} AND c.deleted_at IS NULL
       )
       SELECT id, name, parent_id, created_at, depth FROM subtree`,
      [rootId],
    );
  }

  /**
   * Nested tree for the given root(s), assembled in memory from flat CTE
   * rows (design D3) — `buildTree` is a pure function, unit-testable
   * without a DB.
   */
  async getSubtree(rootId: string | null): Promise<CategoryNode[]> {
    const rows = await this.listFlat(rootId);
    return buildTree(rows);
  }

  /**
   * Ancestor walk from `proposedParentId` up to the root (design D4),
   * meant to run inside the same transaction as the write that calls it.
   * Returns `false` if `categoryId` (the category being created/updated,
   * or `null` for a brand-new category) appears anywhere in that chain —
   * including as `proposedParentId` itself (self-parent).
   */
  async validateNoCycles(
    categoryId: string | null,
    proposedParentId: string | null,
  ): Promise<boolean> {
    if (proposedParentId === null) {
      return true;
    }
    if (categoryId !== null && proposedParentId === categoryId) {
      return false;
    }

    let currentId: string | null = proposedParentId;
    let iterations = 0;

    while (currentId !== null && iterations < MAX_DEPTH) {
      if (categoryId !== null && currentId === categoryId) {
        return false;
      }

      const rows: { parent_id: string | null }[] = await this.dataSource.query(
        `SELECT parent_id FROM incident_categories WHERE id = $1`,
        [currentId],
      );
      if (rows.length === 0) {
        break;
      }
      currentId = rows[0].parent_id;
      iterations += 1;
    }

    return true;
  }
}

/**
 * Links flat, depth-annotated CTE rows into a nested tree (design D3) —
 * pure function, no DB. Sorted by `name` ASC per level. A row whose
 * `parent_id` is not present in the row set (true root, or the top of a
 * subtree query) becomes a top-level node.
 */
export function buildTree(rows: CategoryRow[]): CategoryNode[] {
  const nodesById = new Map<string, CategoryNode>();
  for (const row of rows) {
    nodesById.set(row.id, {
      id: row.id,
      name: row.name,
      parent_id: row.parent_id,
      created_at: row.created_at,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodesById.get(row.id)!;
    if (row.parent_id !== null && nodesById.has(row.parent_id)) {
      nodesById.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(nodes: CategoryNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    sortTree(node.children);
  }
}
