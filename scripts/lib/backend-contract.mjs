import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import ts from "typescript";

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const SUPPORT_FILE = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/;
const CONVEX_KINDS = new Set([
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
  "httpAction",
]);
const PUBLIC_KINDS = new Set(["query", "mutation", "action"]);
const IDENTITY_ARGUMENT = /^(?:user|owner|subject|organization|workspace|tenant|account)Id$/i;
// AGENTS.md declares one canonical ownership shape: doc.userId versus user.subject.
// Supporting aliases here would let the static gate promise more than requireOwner's
// declared contract can actually prove.
const OWNER_FIELD = /^userId$/;
const UNSUPPORTED_OWNER_FIELD = /^(?:owner|organization|workspace|tenant|account)Id$/i;
const ENTITLEMENT_FIELD = /^(?:entitled|entitlement|hasAccess|plan|planKey|tier|access|status|subscriptionStatus|subscriptionId|providerSubscriptionId|currentPeriodEnd)$/i;
const ENTITLEMENT_TABLE = /(?:entitlement|subscription|plan|access)/i;
const ENTITLEMENT_WRITER_NAME = /(?:grant|apply|write|sync|update|reconcile|set|complete).*(?:entitlement|subscription|plan|access)|(?:checkout).*(?:success|complete)/i;
const VERIFICATION_CALL = /^(?:(?:require|assert|validate).*(?:Webhook|CustomerState)|verifyWebhook|constructEvent|timingSafeEqual)$/i;

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "_generated" || entry.name === "node_modules") continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile() && SOURCE_EXTENSION.test(entry.name) && !SUPPORT_FILE.test(entry.name)) files.push(absolute);
  }
  return files;
}

function parse(file, body) {
  const kind = /x$/.test(extname(file)) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true, kind);
}

function toPosix(root, file) {
  return relative(root, file).split(sep).join("/");
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propertyName(node) {
  const name = node?.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function property(object, name) {
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  return object.properties.find((item) => propertyName(item) === name) ?? null;
}

function propertyValue(object, name) {
  const item = property(object, name);
  if (!item) return null;
  if (ts.isPropertyAssignment(item)) return item.initializer;
  if (ts.isMethodDeclaration(item)) return item;
  return null;
}

function terminalName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function descendants(node, predicate) {
  const matches = [];
  if (!node) return matches;
  visit(node, (child) => {
    if (predicate(child)) matches.push(child);
  });
  return matches;
}

function functionBody(node) {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.body ?? null;
  }
  return null;
}

function convexFunctions(sourceFile) {
  const found = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const kind = terminalName(declaration.initializer.expression);
      if (!CONVEX_KINDS.has(kind)) continue;
      const config = declaration.initializer.arguments[0];
      if (!config || !ts.isObjectLiteralExpression(config)) continue;
      const args = propertyValue(config, "args");
      const handler = propertyValue(config, "handler");
      found.push({
        name: declaration.name.text,
        kind,
        node: declaration,
        args,
        handler,
        body: functionBody(handler),
      });
    }
  }
  return found;
}

function ownedTablesFromSchema(sourceFile) {
  const owned = new Map();
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node) || terminalName(node.expression) !== "defineTable") return;
    const fields = node.arguments[0];
    if (!fields || !ts.isObjectLiteralExpression(fields)) return;
    let parent = node.parent;
    while (parent && !ts.isPropertyAssignment(parent) && !ts.isShorthandPropertyAssignment(parent)) parent = parent.parent;
    const table = parent ? propertyName(parent) : null;
    if (!table) return;
    const ownerFields = fields.properties.map(propertyName).filter((name) => name && OWNER_FIELD.test(name));
    if (ownerFields.length > 0) owned.set(table, ownerFields);
  });
  return owned;
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function unsupportedOwnershipFields(sourceFile) {
  const unsupported = [];
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node) || terminalName(node.expression) !== "defineTable") return;
    const fields = node.arguments[0];
    if (!fields || !ts.isObjectLiteralExpression(fields)) return;
    let parent = node.parent;
    while (parent && !ts.isPropertyAssignment(parent) && !ts.isShorthandPropertyAssignment(parent)) parent = parent.parent;
    const table = parent ? propertyName(parent) : null;
    if (!table) return;
    for (const field of fields.properties) {
      const name = propertyName(field);
      if (name && UNSUPPORTED_OWNER_FIELD.test(name)) unsupported.push({ table, name, node: field });
    }
  });
  return unsupported;
}

function namedFunction(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name?.text === name) return statement;
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) return declaration.initializer;
    }
  }
  return null;
}

function isPropertyOf(node, objectName, name) {
  return Boolean(
    ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === objectName &&
      node.name.text === name,
  );
}

function isOwnershipMismatch(node, userName, docName) {
  if (!ts.isBinaryExpression(node)) return false;
  if (![ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) {
    return false;
  }
  return (
    (isPropertyOf(node.left, docName, "userId") && isPropertyOf(node.right, userName, "subject")) ||
    (isPropertyOf(node.right, docName, "userId") && isPropertyOf(node.left, userName, "subject"))
  );
}

function hasCanonicalRequireOwner(sourceFile) {
  const helper = namedFunction(sourceFile, "requireOwner");
  if (!helper || helper.parameters.length < 2) return false;
  const [userParameter, docParameter] = helper.parameters;
  if (!ts.isIdentifier(userParameter.name) || !ts.isIdentifier(docParameter.name)) return false;
  const body = functionBody(helper);
  if (!body) return false;
  return descendants(body, (node) => {
    if (!ts.isIfStatement(node)) return false;
    const mismatch = descendants(
      node.expression,
      (condition) => isOwnershipMismatch(condition, userParameter.name.text, docParameter.name.text),
    ).length > 0;
    const throws = descendants(node.thenStatement, (branch) => ts.isThrowStatement(branch)).length > 0;
    return mismatch && throws;
  }).length > 0;
}

function idArguments(args) {
  const ids = [];
  if (!args || !ts.isObjectLiteralExpression(args)) return ids;
  for (const item of args.properties) {
    const name = propertyName(item);
    if (!name || !ts.isPropertyAssignment(item)) continue;
    const idCalls = descendants(
      item.initializer,
      (node) => ts.isCallExpression(node) && terminalName(node.expression) === "id" && node.arguments.length > 0,
    );
    for (const call of idCalls) {
      const table = call.arguments[0];
      if (ts.isStringLiteralLike(table)) ids.push({ name, table: table.text, node: item });
    }
  }
  return ids;
}

function argumentNames(args) {
  if (!args || !ts.isObjectLiteralExpression(args)) return [];
  return args.properties.map((item) => ({ name: propertyName(item), node: item })).filter((item) => item.name);
}

function callName(node) {
  return ts.isCallExpression(node) ? terminalName(node.expression) : null;
}

function dbWriteCalls(body) {
  return descendants(body, (node) => ts.isCallExpression(node) && ["insert", "patch", "replace", "delete"].includes(callName(node)));
}

function objectHasEntitlementField(node) {
  return Boolean(
    node &&
      ts.isObjectLiteralExpression(node) &&
      node.properties.some((item) => {
        const name = propertyName(item);
        return name ? ENTITLEMENT_FIELD.test(name) : false;
      }),
  );
}

function isEntitlementWrite(call) {
  const method = callName(call);
  if (method === "insert") {
    const table = call.arguments[0];
    if (ts.isStringLiteralLike(table) && ENTITLEMENT_TABLE.test(table.text)) return true;
    return objectHasEntitlementField(call.arguments[1]);
  }
  if (method === "patch" || method === "replace") return objectHasEntitlementField(call.arguments[1]);
  return false;
}

function functionsWithEntitlementWrites(functions) {
  const writers = new Set();
  for (const fn of functions) {
    const callsNamedWriter = descendants(
      fn.body,
      (node) => ts.isCallExpression(node) && ENTITLEMENT_WRITER_NAME.test(callName(node) ?? ""),
    ).length > 0;
    if (dbWriteCalls(fn.body).some(isEntitlementWrite) || ENTITLEMENT_WRITER_NAME.test(fn.name) || callsNamedWriter) {
      writers.add(fn.name);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of functions) {
      if (writers.has(fn.name) || !fn.body) continue;
      const callsWriter = descendants(fn.body, (node) => ts.isCallExpression(node) && writers.has(callName(node))).length > 0;
      if (callsWriter) {
        writers.add(fn.name);
        changed = true;
      }
    }
  }
  return writers;
}

function rejectionBranch(node) {
  return descendants(node, (child) => ts.isThrowStatement(child) || ts.isReturnStatement(child)).length > 0;
}

function verificationGuardBefore(body, position, { requireVerifier = false } = {}) {
  if (!body) return false;
  const guardedIf = descendants(body, (node) => {
    if (!ts.isIfStatement(node) || node.getStart() >= position) return false;
    const condition = node.expression.getText();
    return /verified|signature/i.test(condition) && rejectionBranch(node.thenStatement);
  }).length > 0;
  const verifierCall = descendants(
    body,
    (node) => ts.isCallExpression(node) && node.getStart() < position && VERIFICATION_CALL.test(callName(node) ?? ""),
  ).length > 0;
  return requireVerifier ? guardedIf && verifierCall : guardedIf || verifierCall;
}

function runMutationTargets(body, writerName) {
  return descendants(body, (node) => {
    if (!ts.isCallExpression(node) || callName(node) !== "runMutation") return false;
    const target = node.arguments[0];
    return target ? terminalName(target) === writerName && /\binternal\b/.test(target.getText()) : false;
  });
}

function variableReadFromId(body, argName) {
  const found = [];
  for (const declaration of descendants(body, (node) => ts.isVariableDeclaration(node))) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    const reads = descendants(declaration.initializer, (node) => {
      if (!ts.isCallExpression(node) || callName(node) !== "get") return false;
      const argument = node.arguments[0];
      return Boolean(
        argument &&
          ts.isPropertyAccessExpression(argument) &&
          ts.isIdentifier(argument.expression) &&
          argument.expression.text === "args" &&
          argument.name.text === argName,
      );
    });
    if (reads.length > 0) found.push({ name: declaration.name.text, position: reads[0].getStart() });
  }
  return found[0] ?? null;
}

function callPositions(body, name) {
  return descendants(body, (node) => ts.isCallExpression(node) && callName(node) === name).map((node) => ({
    node,
    position: node.getStart(),
  }));
}

function inspectOwnership({ root, file, sourceFile, functions, ownedTables, violations }) {
  for (const fn of functions) {
    if (!PUBLIC_KINDS.has(fn.kind) || !fn.body) continue;
    for (const id of idArguments(fn.args).filter((item) => ownedTables.has(item.table))) {
      const userCalls = callPositions(fn.body, "requireUser");
      const read = variableReadFromId(fn.body, id.name);
      const ownerCalls = callPositions(fn.body, "requireOwner");
      const ownerGuard = read
        ? ownerCalls.find(({ node, position }) =>
            position > read.position && node.arguments.some((argument) => argument.getText() === read.name),
          )
        : null;

      if (!read) {
        violations.push({
          file,
          line: lineOf(sourceFile, id.node),
          rule: "owned-document-read",
          message: `${fn.name} accepts ${id.table}.${id.name} but does not fetch that document before authorizing it`,
        });
        continue;
      }
      if (!userCalls.some(({ position }) => position < read.position)) {
        violations.push({
          file,
          line: lineOf(sourceFile, fn.node),
          rule: "owned-auth-context",
          message: `${fn.name} must derive identity with requireUser before reading ${id.table}`,
        });
      }
      if (!ownerGuard) {
        violations.push({
          file,
          line: lineOf(sourceFile, fn.node),
          rule: "owned-document-guard",
          message: `${fn.name} must call requireOwner on the fetched ${id.table} document`,
        });
        continue;
      }
      const unguardedWrite = dbWriteCalls(fn.body).find((call) => call.getStart() < ownerGuard.position);
      if (unguardedWrite) {
        violations.push({
          file,
          line: lineOf(sourceFile, unguardedWrite),
          rule: "owned-write-order",
          message: `${fn.name} writes before requireOwner authorizes the fetched ${id.table} document`,
        });
      }
    }
  }
}

function inspectBilling({ file, sourceFile, functions, allSources, violations }) {
  const writers = functionsWithEntitlementWrites(functions);
  for (const fn of functions) {
    if (PUBLIC_KINDS.has(fn.kind)) {
      for (const argument of argumentNames(fn.args).filter((item) => IDENTITY_ARGUMENT.test(item.name))) {
        violations.push({
          file,
          line: lineOf(sourceFile, argument.node),
          rule: "billing-client-identity",
          message: `${fn.name} accepts client-supplied ${argument.name}; billing identity must come from authenticated context`,
        });
      }
    }
    if (!writers.has(fn.name)) continue;
    if (PUBLIC_KINDS.has(fn.kind)) {
      violations.push({
        file,
        line: lineOf(sourceFile, fn.node),
        rule: "billing-public-entitlement-writer",
        message: `${fn.name} is client-facing and can write entitlement state; only a verified webhook-backed internal mutation may do that`,
      });
      continue;
    }
    if (fn.kind !== "internalMutation") {
      violations.push({
        file,
        line: lineOf(sourceFile, fn.node),
        rule: "billing-entitlement-writer-boundary",
        message: `${fn.name} writes entitlement state but is ${fn.kind}; make the writer an internalMutation`,
      });
      continue;
    }

    const firstWrite = dbWriteCalls(fn.body).find(isEntitlementWrite);
    const authorityPoint = firstWrite?.getStart() ?? fn.body?.end ?? fn.node.end;
    if (!verificationGuardBefore(fn.body, authorityPoint)) {
      violations.push({
        file,
        line: lineOf(sourceFile, firstWrite ?? fn.node),
        rule: "billing-writer-verification-guard",
        message: `${fn.name} writes entitlement without rejecting unverified webhook state first`,
      });
    }

    const callers = [];
    for (const source of allSources) {
      for (const caller of source.functions) {
        for (const call of runMutationTargets(caller.body, fn.name)) callers.push({ source, caller, call });
      }
    }
    const verifiedWebhookCallers = callers.filter(
      ({ caller, call }) =>
        caller.kind === "httpAction" && verificationGuardBefore(caller.body, call.getStart(), { requireVerifier: true }),
    );
    for (const { source, caller, call } of callers) {
      if (
        caller.kind === "httpAction" &&
        verificationGuardBefore(caller.body, call.getStart(), { requireVerifier: true })
      ) continue;
      violations.push({
        file: source.file,
        line: lineOf(source.sourceFile, call),
        rule: caller.kind && PUBLIC_KINDS.has(caller.kind) ? "billing-client-entitlement-path" : "billing-unverified-entitlement-path",
        message: `${caller.name} can invoke ${fn.name} without a verified webhook guard`,
      });
    }
    if (verifiedWebhookCallers.length === 0) {
      violations.push({
        file,
        line: lineOf(sourceFile, fn.node),
        rule: "billing-webhook-source",
        message: `${fn.name} has no statically verified httpAction caller; entitlement authority is not proven webhook-driven`,
      });
    }
  }
}

/**
 * Inspect the downstream Convex surface. The plain engine has no `convex/` directory,
 * so it is explicitly not applicable; once a product backend exists, missing schema or
 * unsafe billing/ownership paths fail closed.
 */
export function inspectBackendContract(root) {
  const convexRoot = join(root, "convex");
  if (!existsSync(convexRoot)) return { applicable: false, violations: [] };

  const files = walk(convexRoot).sort();
  const sources = files.map((absolute) => {
    const body = readFileSync(absolute, "utf8");
    const sourceFile = parse(absolute, body);
    return {
      absolute,
      file: toPosix(root, absolute),
      body,
      sourceFile,
      functions: convexFunctions(sourceFile),
    };
  });
  const violations = [];
  const schema = sources.find((source) => source.file === "convex/schema.ts");
  if (!schema) {
    violations.push({ file: "convex/schema.ts", line: 1, rule: "backend-schema", message: "downstream Convex backend is missing schema.ts" });
    return { applicable: true, violations };
  }
  const ownedTables = ownedTablesFromSchema(schema.sourceFile);
  for (const field of unsupportedOwnershipFields(schema.sourceFile)) {
    violations.push({
      file: schema.file,
      line: lineOf(schema.sourceFile, field.node),
      rule: "owned-schema-field",
      message: `${field.table}.${field.name} is not the declared ownership shape; use userId so requireOwner can compare it with user.subject`,
    });
  }
  if (ownedTables.size > 0) {
    const auth = sources.find((source) => source.file === "convex/lib/auth.ts");
    if (!auth || !hasCanonicalRequireOwner(auth.sourceFile)) {
      violations.push({
        file: "convex/lib/auth.ts",
        line: 1,
        rule: "owned-owner-helper",
        message: "requireOwner(user, doc) must throw when doc.userId does not equal user.subject",
      });
    }
  }
  for (const source of sources) {
    inspectOwnership({ root, ...source, ownedTables, violations });
  }
  const billing = sources.find((source) => source.file === "convex/billing.ts");
  if (billing) inspectBilling({ ...billing, allSources: sources, violations });
  return { applicable: true, violations };
}
