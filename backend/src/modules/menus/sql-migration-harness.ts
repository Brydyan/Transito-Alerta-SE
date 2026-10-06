import * as fs from 'fs';
import * as path from 'path';

export interface SimulatedMenuOption {
  id: string;
  route: string;
}

export interface SimulatedState {
  menuOptions: SimulatedMenuOption[];
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  
  while (i < sql.length) {
    const char = sql[i];
    
    // String literal (single quotes)
    if (char === "'") {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === "'") {
          // Check for escaped quote ''
          if (end + 1 < sql.length && sql[end + 1] === "'") {
            end += 2;
          } else {
            end++;
            break;
          }
        } else {
          end++;
        }
      }
      current += sql.substring(i, end);
      i = end;
      continue;
    }
    
    // Dollar quoted string
    if (char === '$' && i + 1 < sql.length && sql[i+1] === '$') {
      let end = sql.indexOf('$$', i + 2);
      if (end === -1) end = sql.length;
      else end += 2;
      current += sql.substring(i, end);
      i = end;
      continue;
    }
    
    // Line comment
    if (char === '-' && i + 1 < sql.length && sql[i+1] === '-') {
      let end = sql.indexOf('\n', i + 2);
      if (end === -1) end = sql.length;
      current += ' ';
      i = end;
      continue;
    }

    // Multiline comment /* ... */
    if (char === '/' && i + 1 < sql.length && sql[i+1] === '*') {
      let end = sql.indexOf('*/', i + 2);
      if (end === -1) end = sql.length;
      else end += 2;
      current += ' ';
      i = end;
      continue;
    }

    if (char === ';') {
      const stmt = current.trim();
      if (stmt) {
        statements.push(stmt);
      }
      current = '';
      i++;
      continue;
    }
    
    current += char;
    i++;
  }
  
  const last = current.trim();
  if (last) {
    statements.push(last);
  }
  
  return statements;
}

function parseValuesList(valuesStr: string, file: string, stmt: string): string[][] {
  const tuples: string[][] = [];
  let i = 0;
  while (i < valuesStr.length) {
    if (valuesStr[i] === '(') {
      i++;
      const fields: string[] = [];
      let currentField = '';
      let inString = false;
      let parenDepth = 1;
      
      while (i < valuesStr.length) {
        const char = valuesStr[i];
        if (char === "'") {
          if (inString && i + 1 < valuesStr.length && valuesStr[i+1] === "'") {
            currentField += "''";
            i += 2;
            continue;
          }
          inString = !inString;
          currentField += char;
        } else if (!inString && char === '(') {
          parenDepth++;
          currentField += char;
        } else if (!inString && char === ')') {
          parenDepth--;
          if (parenDepth === 0) {
            fields.push(currentField.trim());
            tuples.push(fields);
            i++;
            break;
          } else {
            currentField += char;
          }
        } else if (!inString && parenDepth === 1 && char === ',') {
          fields.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
        i++;
      }
    } else {
      // Outside a tuple only whitespace and tuple separators are legal. Anything
      // else is an unmodelled trailing clause (RETURNING, ON CONFLICT DO UPDATE,
      // a CTE, ...) and must fail loudly instead of being swallowed: silently
      // dropping it could hide a write that renames or removes a route, which
      // would make the coverage conclusion wrong rather than merely incomplete.
      if (!/[\s,]/.test(valuesStr[i])) {
        throw new Error(
          `Unrecognized trailing content after the values list in ${file}. ` +
            `The parser models only tuple lists and an optional ` +
            `ON CONFLICT (...) DO NOTHING clause: ${stmt}`
        );
      }
      i++;
    }
  }
  return tuples;
}

function extractStringLiteral(str: string | undefined): string | null {
  if (typeof str === 'string' && str.startsWith("'") && str.endsWith("'")) {
    return str.substring(1, str.length - 1).replace(/''/g, "'");
  }
  return null;
}

export function parseMigrations(migrationsDir: string): SimulatedState {
  const state: SimulatedState = { menuOptions: [] };
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  let internalIdCounter = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = splitStatements(content);
    
    for (const stmt of statements) {
      // Normalize whitespace for easier matching
      const normalizedStmt = stmt.replace(/\s+/g, ' ');
      
      // Match writes to menu_options table.
      // Must use \b to not match menu_option_roles.
      const isMenuOptionsWrite = /^(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(?:public\.)?menu_options\b/i.test(normalizedStmt);
      if (!isMenuOptionsWrite) {
        continue;
      }
      
      // Shape 1: INSERT INTO menu_options (...) VALUES (...) [ON CONFLICT ...]
      const shape1Regex = /^INSERT\s+INTO\s+(?:public\.)?menu_options\s*\([^)]+\)\s*VALUES\s*([\s\S]+)$/i;
      const match1 = stmt.match(shape1Regex);
      if (match1) {
        let valuesStr = match1[1].trim();
        const onConflictRegex = /(?:\s+ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+NOTHING)\s*$/i;
        valuesStr = valuesStr.replace(onConflictRegex, '').trim();
        
        const tuples = parseValuesList(valuesStr, file, stmt);
        if (tuples.length === 0) {
          throw new Error(`Failed to parse values for Shape 1 in ${file}: ${stmt}`);
        }
        
        for (const tuple of tuples) {
          // Tuple shape is ('id', 'Name', '/route', ...)
          // First field is id, third field is route (index 2)
          let id = extractStringLiteral(tuple[0]);
          const route = extractStringLiteral(tuple[2]);
          
          if (route === null) {
            throw new Error(`Could not extract string literal for route from tuple [${tuple.join(', ')}] in ${file}`);
          }
          
          if (id === null) {
            internalIdCounter++;
            id = `synthetic-id-${internalIdCounter}`;
          }
          
          state.menuOptions.push({ id, route });
        }
        continue;
      }
      
      // Shape 2: INSERT INTO menu_options (...) SELECT ... WHERE NOT EXISTS (...)
      const shape2Regex = /^INSERT\s+INTO\s+(?:public\.)?menu_options\s*\([^)]+\)\s*SELECT\s+(.+?)\s+WHERE\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:public\.)?menu_options\s+WHERE\s+route\s*=\s*'([^']+)'\s+AND\s+deleted_at\s+IS\s+NULL\s*\)$/i;
      const match2 = normalizedStmt.match(shape2Regex);
      if (match2) {
        const route = match2[2];
        const existing = state.menuOptions.find(mo => mo.route === route);
        if (!existing) {
          internalIdCounter++;
          state.menuOptions.push({ id: `synthetic-id-${internalIdCounter}`, route });
        }
        continue;
      }
      
      // Shape 3: UPDATE menu_options SET route = '<new>' WHERE id = '<literal-uuid>' AND route = '<old>'
      const shape3Regex = /^UPDATE\s+(?:public\.)?menu_options\s+SET\s+route\s*=\s*'([^']+)'\s+WHERE\s+id\s*=\s*'([^']+)'\s+AND\s+route\s*=\s*'([^']+)'$/i;
      const match3 = normalizedStmt.match(shape3Regex);
      if (match3) {
        const newRoute = match3[1];
        const id = match3[2];
        const oldRoute = match3[3];
        
        const rowIndex = state.menuOptions.findIndex(mo => mo.id === id && mo.route === oldRoute);
        if (rowIndex !== -1) {
          state.menuOptions[rowIndex].route = newRoute;
        }
        continue;
      }
      
      // If we reach here, it's a write to menu_options that doesn't match any known shape
      throw new Error(`Unrecognized statement writing to menu_options in ${file}: ${stmt}`);
    }
  }
  
  return state;
}
