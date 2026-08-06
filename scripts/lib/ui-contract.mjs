import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const AUTHORED_COMPONENT_DIRS = [
  "src/components/blocks",
  "src/components/features",
  "src/components/magicui",
];

const CLASS_SCAN_FILES = ["mdx-components.tsx"];
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const SUPPORT_FILE = /(?:\.fixture|\.stories|\.test|\.spec)\.[cm]?[jt]sx?$/;
const PALETTE_CLASS = /(?:^|:)(?:bg|text|border|from|to|via|fill|stroke|ring|shadow)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?|white|black)$/;
const ARBITRARY_VALUE = /(?:^|:)(?:[a-z][\w-]*)-\[[^\]]+\]$/;
const ARBITRARY_PROPERTY = /^\[--[^\]]+\]$/;
const HEX_COLOR = /#[\da-fA-F]{3,8}\b/;
const CLASS_HELPERS = new Set(["cn", "clsx", "cva"]);

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && SOURCE_EXTENSION.test(entry.name)) files.push(full);
  }
  return files;
}

function toPosix(root, file) {
  return relative(root, file).split(sep).join("/");
}

function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function exportedComponents(sourceFile) {
  const names = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name && /^[A-Z]/.test(statement.name.text)) {
      names.push(statement.name.text);
    }
    if (ts.isClassDeclaration(statement) && isExported(statement) && statement.name && /^[A-Z]/.test(statement.name.text)) {
      names.push(statement.name.text);
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text)) names.push(declaration.name.text);
      }
    }
    if (ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      if (ts.isIdentifier(expression) && /^[A-Z]/.test(expression.text)) names.push(expression.text);
    }
  }
  return [...new Set(names)];
}

function literalText(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function classValues(sourceFile) {
  const values = [];
  const collectStrings = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) values.push(node.text);
    ts.forEachChild(node, collectStrings);
  };
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "className" && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) values.push(node.initializer.text);
      if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const text = literalText(node.initializer.expression);
        if (text !== null) values.push(text);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_HELPERS.has(node.expression.text)) {
      for (const argument of node.arguments) collectStrings(argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function inspectUnsafeUi({ file, sourceFile, violations }) {
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === "dangerouslySetInnerHTML") {
      violations.push({
        file,
        line: lineOf(sourceFile, node),
        rule: "untrusted-ui",
        message: "dangerouslySetInnerHTML is forbidden in authored UI; render typed content instead",
      });
    }
    if (ts.isCallExpression(node)) {
      const direct = ts.isIdentifier(node.expression) ? node.expression.text : null;
      const property = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : null;
      const forbidden = ["atob", "eval", "fetch"].find((name) => direct === name || property === name);
      if (forbidden) {
        violations.push({
          file,
          line: lineOf(sourceFile, node),
          rule: "untrusted-ui",
          message: `\`${forbidden}\` is forbidden in authored UI; use a repository seam and inspect community code as data`,
        });
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
      violations.push({
        file,
        line: lineOf(sourceFile, node),
        rule: "untrusted-ui",
        message: "dynamic Function construction is forbidden in authored UI",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function parse(file, body) {
  const kind = /x$/.test(extname(file)) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true, kind);
}

function inspectClassTokens({ file, sourceFile, violations }) {
  for (const classes of classValues(sourceFile)) {
    for (const token of classes.split(/\s+/).filter(Boolean)) {
      if (PALETTE_CLASS.test(token)) {
        violations.push({ file, rule: "design-token", message: `palette utility \`${token}\` must use a semantic token` });
      }
      if (ARBITRARY_VALUE.test(token) || ARBITRARY_PROPERTY.test(token)) {
        violations.push({ file, rule: "design-token", message: `arbitrary value \`${token}\` must become a named token or standard utility` });
      }
      if (HEX_COLOR.test(token)) {
        violations.push({ file, rule: "design-token", message: `raw color in \`${token}\` must become a semantic token` });
      }
    }
  }
}

function inspectBlock({ root, absolute, file, body, sourceFile, violations }) {
  const forbiddenImports = [];
  const statefulHooks = new Set([
    "useAction",
    "useEffect",
    "useMutation",
    "usePaginatedQuery",
    "useQuery",
    "useReducer",
    "useState",
    "useStore",
    "useSyncExternalStore",
  ]);

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const resolvedRelative = specifier.startsWith(".")
        ? toPosix(root, resolve(dirname(absolute), specifier))
        : "";
      if (
        /(?:^|\/)components\/(?:blocks|features)(?:\/|$)/.test(specifier) ||
        /(?:^|\/)stores(?:\/|$)/.test(specifier) ||
        specifier === "convex/react" ||
        /(?:^|\/)lib\/convex-api(?:\/|$)/.test(specifier) ||
        resolvedRelative.startsWith("src/components/blocks/") ||
        resolvedRelative.startsWith("src/components/features/") ||
        resolvedRelative.startsWith("src/stores/") ||
        resolvedRelative.startsWith("src/lib/convex-api")
      ) {
        forbiddenImports.push({ specifier, line: lineOf(sourceFile, node) });
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && statefulHooks.has(node.expression.text)) {
      violations.push({
        file,
        line: lineOf(sourceFile, node),
        rule: "block-purity",
        message: `blocks are props-in/JSX-out; \`${node.expression.text}\` belongs in a feature component`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const item of forbiddenImports) {
    violations.push({
      file,
      line: item.line,
      rule: "block-dependency",
      message: `block cannot import \`${item.specifier}\`; blocks only compose ui/ and magicui/ primitives`,
    });
  }

  const stem = basename(file).replace(/\.[^.]+$/, "");
  const fixture = join(absolute.slice(0, -extname(absolute).length) + `.fixture${extname(absolute)}`);
  if (!existsSync(fixture)) {
    violations.push({
      file,
      rule: "block-fixture",
      message: `missing ${stem}.fixture${extname(absolute)} with standalone mock props`,
    });
  } else if (!/export\s+const\s+fixture\b/.test(readFileSync(fixture, "utf8"))) {
    violations.push({
      file: toPosix(root, fixture),
      rule: "block-fixture",
      message: "fixture file must export `fixture` so tooling can render the block deterministically",
    });
  }

  if (/^\s*["']use client["']/m.test(body)) {
    violations.push({ file, rule: "block-purity", message: "blocks are presentational and must not declare `use client`" });
  }
}

export function inspectUiContract(root) {
  const violations = [];
  const authoredFiles = AUTHORED_COMPONENT_DIRS.flatMap((directory) => walk(join(root, directory)));
  const appFiles = walk(join(root, "src", "app"));
  const sharedFiles = walk(join(root, "src", "components")).filter(
    (file) => !toPosix(root, file).startsWith("src/components/ui/"),
  );
  const scanFiles = new Set([
    ...appFiles,
    ...sharedFiles,
    ...CLASS_SCAN_FILES.map((file) => join(root, file)).filter(existsSync),
  ]);

  for (const absolute of scanFiles) {
    const file = toPosix(root, absolute);
    const body = readFileSync(absolute, "utf8");
    const sourceFile = parse(file, body);
    inspectClassTokens({ file, sourceFile, violations });
    inspectUnsafeUi({ file, sourceFile, violations });
  }

  for (const absolute of authoredFiles) {
    const file = toPosix(root, absolute);
    if (SUPPORT_FILE.test(file)) continue;
    const body = readFileSync(absolute, "utf8");
    const sourceFile = parse(file, body);
    const components = exportedComponents(sourceFile);
    const stem = basename(file, extname(file));

    if (components.length !== 1) {
      violations.push({
        file,
        rule: "one-component-per-file",
        message: `expected exactly one exported component, found ${components.length}${components.length ? ` (${components.join(", ")})` : ""}`,
      });
    } else if (toKebab(components[0]) !== stem) {
      violations.push({
        file,
        rule: "component-name",
        message: `file name must match export \`${components[0]}\` (expected ${toKebab(components[0])}${extname(file)})`,
      });
    }

    if (file.startsWith("src/components/blocks/")) {
      inspectBlock({ root, absolute, file, body, sourceFile, violations });
    }
  }

  return violations.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
}
