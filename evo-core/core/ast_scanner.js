/**
 * EVO-CORE AST CONTEXT SCANNER
 * Lightweight, zero-dependency static structural scanner for JS/TS/Python/MQL files.
 * Extracts function signatures, exports, imports, and parameters prior to code mutation.
 */

import fs from 'node:fs';
import path from 'node:path';

export class ASTScanner {
  /**
   * Scans a file and extracts structural metadata.
   */
  static scanFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found for AST scan: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    return {
      filePath,
      ext,
      lineCount: content.split('\n').length,
      functions: ASTScanner.extractFunctions(content, ext),
      classes: ASTScanner.extractClasses(content, ext),
      imports: ASTScanner.extractImports(content, ext),
      exports: ASTScanner.extractExports(content, ext)
    };
  }

  /**
   * Extracts function names and parameter lists.
   */
  static extractFunctions(content, ext) {
    const functions = [];
    let match;

    if (ext === '.py') {
      // Python def function_name(arg1, arg2):
      const pyFuncRegex = /^\s*def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\):/gm;
      while ((match = pyFuncRegex.exec(content)) !== null) {
        functions.push({
          name: match[1],
          params: match[2].split(',').map(p => p.trim()).filter(Boolean),
          type: 'python'
        });
      }
    } else if (ext === '.mq4' || ext === '.mq5' || ext === '.cpp' || ext === '.h') {
      // C-like / MQL: int OnInit(), void OnTick(), double CalculateEMA(int period, double price)
      const mqlFuncRegex = /(?:[A-Za-z0-9_]+[\s\*]+)+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/gm;
      while ((match = mqlFuncRegex.exec(content)) !== null) {
        if (!['if', 'for', 'while', 'switch'].includes(match[1])) {
          functions.push({
            name: match[1],
            params: match[2].split(',').map(p => p.trim()).filter(Boolean),
            type: 'mql_c'
          });
        }
      }
    } else {
      // JavaScript / TypeScript: function name(a, b) OR const name = (a, b) => OR class methods
      const jsFuncRegex = /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gm;
      while ((match = jsFuncRegex.exec(content)) !== null) {
        functions.push({
          name: match[1],
          params: match[2].split(',').map(p => p.trim()).filter(Boolean),
          type: 'js_function'
        });
      }

      const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/gm;
      while ((match = arrowRegex.exec(content)) !== null) {
        functions.push({
          name: match[1],
          params: match[2].split(',').map(p => p.trim()).filter(Boolean),
          type: 'js_arrow'
        });
      }

      const methodRegex = /^\s*(?:static\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/gm;
      while ((match = methodRegex.exec(content)) !== null) {
        if (!['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(match[1])) {
          functions.push({
            name: match[1],
            params: match[2].split(',').map(p => p.trim()).filter(Boolean),
            type: 'js_method'
          });
        }
      }
    }

    return functions;
  }

  /**
   * Extracts class definitions.
   */
  static extractClasses(content, ext) {
    const classes = [];
    const classRegex = /class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?/g;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      classes.push({
        name: match[1],
        extends: match[2] || null
      });
    }

    return classes;
  }

  /**
   * Extracts imported dependencies.
   */
  static extractImports(content, ext) {
    const imports = [];
    let match;

    if (ext === '.py') {
      const pyImportRegex = /^(?:from\s+([A-Za-z0-9_\.]+)\s+import|import\s+([A-Za-z0-9_\.]+))/gm;
      while ((match = pyImportRegex.exec(content)) !== null) {
        imports.push(match[1] || match[2]);
      }
    } else {
      const esImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+[A-Za-z0-9_]+|[A-Za-z0-9_]+)\s+from\s+)?['"]([^'"]+)['"]/gm;
      while ((match = esImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  /**
   * Extracts exported symbols.
   */
  static extractExports(content, ext) {
    const exportsList = [];
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+([A-Za-z0-9_]+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exportsList.push(match[1]);
    }

    return exportsList;
  }
}
