// In-memory DynamoDB test double with faithful semantics for the subset of
// expressions LineLess uses. Every operation executes atomically (synchronously
// after a microtask yield), so concurrent service flows interleave exactly
// like they do against real DynamoDB — enabling genuine race testing.
//
// Supported:
//  - Get/Put/Delete/Update/Query/TransactWrite/BatchGet
//  - Conditions: attribute_not_exists/attribute_exists, comparisons,
//    IN lists, AND/OR, parentheses
//  - Updates: SET (incl. if_not_exists + arithmetic), REMOVE, ADD
//  - Query: =, BETWEEN, >, >=, <, <=, begins_with on sort keys; GSI1-3;
//    filters; Limit; ExclusiveStartKey; ScanIndexForward; Select COUNT

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function attrName(path, names) {
  if (path.startsWith('#')) {
    const resolved = names?.[path];
    if (!resolved) throw new Error(`Unknown expression name: ${path}`);
    return resolved;
  }
  return path;
}

function readPath(item, path, names) {
  if (item === null || item === undefined) return undefined;
  return item[attrName(path, names)];
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(a, op, b) {
  switch (op) {
    case '=': return deepEq(a, b);
    case '<>': return !deepEq(a, b);
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    default: throw new Error(`Unknown operator ${op}`);
  }
}

/** Tokenizer for condition/update expressions. */
class ExprTokenizer {
  constructor(expr) {
    this.tokens = [];
    const re = /\s*(attribute_not_exists|attribute_exists|if_not_exists|begins_with|IN|AND|OR|\(|\)|=|<>|<=|>=|<|>|,|:[A-Za-z0-9_]+|#[A-Za-z0-9_]+|[A-Za-z_][A-Za-z0-9_]*)/g;
    let rest = expr;
    let match;
    let lastIndex = 0;
    while ((match = re.exec(expr)) !== null) {
      if (match.index > lastIndex) {
        const gap = expr.slice(lastIndex, match.index).trim();
        if (gap) throw new Error(`Cannot tokenize expression near: ${gap}`);
      }
      this.tokens.push(match[1]);
      lastIndex = re.lastIndex;
    }
    void rest;
    const tail = expr.slice(lastIndex).trim();
    if (tail) throw new Error(`Cannot tokenize expression tail: ${tail}`);
    this.pos = 0;
  }

  hasNext() { return this.pos < this.tokens.length; }
  peek() { return this.tokens[this.pos]; }

  skipSpaces() { /* tokens are pre-split */ }

  isKeyword(kw) { return this.hasNext() && this.tokens[this.pos] === kw; }
  matchKeyword(kw) {
    if (this.isKeyword(kw)) { this.pos += 1; return true; }
    return false;
  }
  matchSymbol(sym) {
    if (this.hasNext() && this.tokens[this.pos] === sym) { this.pos += 1; return true; }
    return false;
  }
  expectSymbol(sym) {
    if (!this.matchSymbol(sym)) throw new Error(`Expected ${sym} near ${this.peek()}`);
  }
  matchOp() {
    if (!this.hasNext()) return null;
    const t = this.tokens[this.pos];
    if (['=', '<>', '<', '>', '<=', '>='].includes(t)) { this.pos += 1; return t; }
    return null;
  }
  matchFunction(fn) {
    if (this.isKeyword(fn)) {
      this.pos += 1;
      return true;
    }
    return false;
  }
  expectArgs() {
    this.expectSymbol('(');
    const args = [];
    while (!this.matchSymbol(')')) {
      args.push(this.nextToken());
      this.matchSymbol(',');
    }
    return args.map((a) => a.trim());
  }
  nextToken() {
    if (!this.hasNext()) throw new Error('Unexpected end of expression');
    const tok = this.tokens[this.pos];
    this.pos += 1;
    return tok;
  }
}

function evalCondition(expr, item, names, values) {
  if (!expr) return true;
  const p = new ExprTokenizer(expr);
  const result = parseOr(p, item, names, values);
  if (p.hasNext()) throw new Error(`Unexpected token in condition: ${p.peek()}`);
  return result;
}

function parseOr(p, item, names, values) {
  let left = parseAnd(p, item, names, values);
  while (p.matchKeyword('OR')) {
    const right = parseAnd(p, item, names, values);
    left = left || right;
  }
  return left;
}

function parseAnd(p, item, names, values) {
  let left = parsePrimary(p, item, names, values);
  while (p.matchKeyword('AND')) {
    const right = parsePrimary(p, item, names, values);
    left = left && right;
  }
  return left;
}

function parsePrimary(p, item, names, values) {
  if (p.matchSymbol('(')) {
    const v = parseOr(p, item, names, values);
    p.expectSymbol(')');
    return v;
  }
  if (p.matchFunction('attribute_not_exists')) {
    const [arg] = p.expectArgs();
    return readPath(item, arg, names) === undefined;
  }
  if (p.matchFunction('attribute_exists')) {
    const [arg] = p.expectArgs();
    return readPath(item, arg, names) !== undefined;
  }
  const left = parseOperand(p, values, names, item);
  if (p.matchKeyword('IN')) {
    p.expectSymbol('(');
    const list = [];
    while (!p.matchSymbol(')')) {
      list.push(parseOperand(p, values, names, item));
      p.matchSymbol(',');
    }
    return list.some((v) => deepEq(v, left));
  }
  const op = p.matchOp();
  if (!op) throw new Error(`Expected comparison operator near: ${p.peek()}`);
  const right = parseOperand(p, values, names, item);
  return compare(left, op, right);
}

function parseOperand(p, values, names, item) {
  const tok = p.nextToken();
  if (tok.startsWith(':')) {
    if (!(tok in values)) throw new Error(`Unknown value placeholder ${tok}`);
    return values[tok];
  }
  if (tok.startsWith('#') || /^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
    return readPath(item, tok, names);
  }
  throw new Error(`Cannot parse operand: ${tok}`);
}

export function createMemDynamo() {
  const table = new Map(); // "PK\u0000SK" -> item
  const keyOf = (k) => `${k.PK}\u0000${k.SK}`;

  function resolveOperand(token, values) {
    if (token.startsWith(':')) {
      if (!(token in values)) throw new Error(`Unknown placeholder ${token}`);
      return values[token];
    }
    return Number(token);
  }

  function splitUpdateClauses(expr) {
    const out = [];
    const re = /\b(SET|REMOVE|ADD)\b/g;
    let match;
    const marks = [];
    while ((match = re.exec(expr)) !== null) marks.push({ verb: match[1], index: match.index });
    for (let i = 0; i < marks.length; i += 1) {
      const start = marks[i].index + marks[i].verb.length;
      const end = i + 1 < marks.length ? marks[i + 1].index : expr.length;
      out.push({ verb: marks[i].verb, body: expr.slice(start, end) });
    }
    return out;
  }

  function splitTop(str, sep) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of str) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === sep && depth === 0) {
        parts.push(current);
        current = '';
      } else current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  function evalSetExpr(expr, original, updated, names, values) {
    const terms = [];
    let rest = expr;
    let op = '+';
    while (rest.trim()) {
      rest = rest.trim();
      let term;
      if (rest.startsWith('if_not_exists')) {
        const close = rest.indexOf(')');
        const inner = rest.slice('if_not_exists('.length, close);
        term = { ifNotExists: inner };
        rest = rest.slice(close + 1);
      } else if (rest.startsWith(':')) {
        const m = /^(:[A-Za-z0-9_]+)/.exec(rest);
        term = { value: resolveOperand(m[1], values) };
        rest = rest.slice(m[1].length);
      } else if (/^\d+/.test(rest)) {
        const m = /^(\d+)/.exec(rest);
        term = { value: Number(m[1]) };
        rest = rest.slice(m[1].length);
      } else {
        throw new Error(`Cannot parse SET term: ${rest}`);
      }
      terms.push({ op, term });
      const opMatch = /^\s*([+-])\s*/.exec(rest);
      if (opMatch) {
        op = opMatch[1];
        rest = rest.slice(opMatch[0].length);
      } else break;
    }

    let result = null;
    for (const { op: o, term } of terms) {
      let v;
      if (term.ifNotExists) {
        const [rawPath, rawDefault] = term.ifNotExists.split(',');
        const key = attrName(rawPath.trim(), names);
        const existing = updated[key] !== undefined ? updated[key] : original[key];
        v = existing !== undefined ? existing : resolveOperand(rawDefault.trim(), values);
      } else {
        v = term.value;
      }
      if (result === null) result = v;
      else result = o === '+' ? result + v : result - v;
    }
    return result;
  }

  function applyUpdate(item, expr, names, values) {
    const segments = splitUpdateClauses(expr);
    const updated = { ...item };
    for (const { verb, body } of segments) {
      if (verb === 'REMOVE') {
        for (const raw of body.split(',')) {
          const path = raw.trim();
          if (!path) continue;
          delete updated[attrName(path, names)];
        }
      } else if (verb === 'ADD') {
        for (const clause of splitTop(body, ',')) {
          const [path, val] = clause.trim().split(/\s+/);
          const key = attrName(path, names);
          const inc = resolveOperand(val, values);
          updated[key] = (typeof updated[key] === 'number' ? updated[key] : 0) + inc;
        }
      } else {
        for (const clause of splitTop(body, ',')) {
          const eq = clause.indexOf('=');
          if (eq === -1) throw new Error(`Bad SET clause: ${clause}`);
          const path = clause.slice(0, eq).trim();
          const valueExpr = clause.slice(eq + 1).trim();
          const key = attrName(path, names);
          updated[key] = evalSetExpr(valueExpr, item, updated, names, values);
        }
      }
    }
    return updated;
  }

  function matchingIndexKeys(item, indexName) {
    const pk = `${indexName}PK`;
    const sk = `${indexName}SK`;
    if (item[pk] === undefined || item[sk] === undefined) return null;
    // Expose both normalized PK/SK and the raw GSI attribute names so that
    // key conditions can reference either form.
    return { PK: item[pk], SK: item[sk], [pk]: item[pk], [sk]: item[sk] };
  }

  function parseKeyCondition(expr, names, values) {
    // Protect AND inside BETWEEN ... AND ... from being treated as a conjunction
    const BETWEEN_AND = '__BAND__';
    const protectedExpr = expr.replace(
      /\bBETWEEN\s+(:[\w]+)\s+AND\s+(:[\w]+)/g,
      (_, lo, hi) => `BETWEEN ${lo} ${BETWEEN_AND} ${hi}`,
    );
    const clauses = protectedExpr.split(/\s+AND\s+/);
    const checks = [];
    for (const raw of clauses) {
      const c = raw.trim().replace(BETWEEN_AND, 'AND');
      let m;
      if ((m = /^(\S+)\s*=\s*(:\w+)$/.exec(c))) {
        const key = attrName(m[1], names);
        const val = values[m[2]];
        checks.push((keys) => deepEq(keys[key], val));
      } else if ((m = /^(\S+)\s*BETWEEN\s+(:\w+)\s+AND\s+(:\w+)$/.exec(c))) {
        const key = attrName(m[1], names);
        const lo = values[m[2]];
        const hi = values[m[3]];
        checks.push((keys) => keys[key] >= lo && keys[key] <= hi);
      } else if ((m = /^(\S+)\s*(>=|<=|>|<)\s*(:\w+)$/.exec(c))) {
        const key = attrName(m[1], names);
        const val = values[m[3]];
        checks.push((keys) => compare(keys[key], m[2], val));
      } else if ((m = /^begins_with\(\s*(\S+)\s*,\s*(:\w+)\s*\)$/.exec(c))) {
        const key = attrName(m[1], names);
        const prefix = values[m[2]];
        checks.push((keys) => typeof keys[key] === 'string' && keys[key].startsWith(prefix));
      } else {
        throw new Error(`Unsupported key condition: ${c}`);
      }
    }
    return (keys) => checks.every((fn) => fn(keys));
  }

  async function query(args) {
    await yieldToEventLoop();
    const {
      KeyConditionExpression, FilterExpression, ExpressionAttributeNames: names,
      ExpressionAttributeValues: values, IndexName, ScanIndexForward = true,
      ExclusiveStartKey, Limit, Select,
    } = args;

    let rows = [...table.values()].map((item) => ({
      item,
      keys: IndexName ? matchingIndexKeys(item, IndexName) : { PK: item.PK, SK: item.SK },
    }));
    rows = rows.filter((x) => x.keys !== null);

    const keyPred = parseKeyCondition(KeyConditionExpression, names, values);
    rows = rows.filter((x) => keyPred(x.keys));

    if (FilterExpression) {
      rows = rows.filter((x) => evalCondition(FilterExpression, x.item, names, values));
    }

    rows.sort((a, b) => {
      const cmp = String(a.keys.SK).localeCompare(String(b.keys.SK));
      return ScanIndexForward ? cmp : -cmp;
    });

    let startIdx = 0;
    if (ExclusiveStartKey) {
      if (IndexName) {
        startIdx = rows.findIndex(
          (x) => x.keys.PK === ExclusiveStartKey[`${IndexName}PK`] && x.keys.SK === ExclusiveStartKey[`${IndexName}SK`],
        );
      } else {
        startIdx = rows.findIndex((x) => x.keys.PK === ExclusiveStartKey.PK && x.keys.SK === ExclusiveStartKey.SK);
      }
      if (startIdx >= 0) startIdx += 1;
    }

    const slice = Limit ? rows.slice(startIdx, startIdx + Limit) : rows.slice(startIdx);
    const last = slice[slice.length - 1];
    const hasMore = Limit !== undefined && startIdx + Limit < rows.length;
    const LastEvaluatedKey = hasMore && last
      ? (IndexName
        ? { [`${IndexName}PK`]: last.keys.PK, [`${IndexName}SK`]: last.keys.SK }
        : { PK: last.keys.PK, SK: last.keys.SK })
      : undefined;

    if (Select === 'COUNT') return { items: [], count: slice.length, nextCursor: null };

    return {
      items: slice.map((x) => x.item),
      count: slice.length,
      nextCursor: LastEvaluatedKey ?? null,
    };
  }

  async function transactWrite(TransactItems) {
    await yieldToEventLoop();
    const cancellationReasons = [];
    for (let i = 0; i < TransactItems.length; i += 1) {
      const [verb, spec] = Object.entries(TransactItems[i])[0];
      let item = null;
      if (verb === 'Put') item = table.get(keyOf(spec.Item)) ?? null;
      else if (verb === 'Update') item = table.get(keyOf(spec.Key)) ?? {};
      else if (verb === 'Delete' || verb === 'ConditionCheck') item = table.get(keyOf(spec.Key)) ?? null;
      const ok = evalCondition(
        spec.ConditionExpression, item, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues,
      );
      cancellationReasons.push(ok
        ? { Code: 'None', Message: null }
        : { Code: 'ConditionalCheckFailed', Message: `condition failed on op ${i}` });
    }
    if (cancellationReasons.some((r) => r.Code !== 'None')) {
      const err = new Error('Transaction cancelled');
      err.name = 'TransactionCanceledException';
      err.CancellationReasons = cancellationReasons;
      throw err;
    }
    for (const op of TransactItems) {
      const [verb, spec] = Object.entries(op)[0];
      if (verb === 'Put') table.set(keyOf(spec.Item), { ...spec.Item });
      else if (verb === 'Delete') table.delete(keyOf(spec.Key));
      else if (verb === 'Update') {
        const existing = table.get(keyOf(spec.Key)) ?? {};
        const next = applyUpdate(existing, spec.UpdateExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues);
        table.set(keyOf(spec.Key), { ...spec.Key, ...next });
      }
    }
    return {};
  }

  async function get(Key) {
    await yieldToEventLoop();
    return table.get(keyOf(Key)) ?? null;
  }

  async function put(Item) {
    await yieldToEventLoop();
    table.set(keyOf(Item), { ...Item });
    return {};
  }

  async function del2(Key) {
    await yieldToEventLoop();
    table.delete(keyOf(Key));
    return {};
  }

  async function update(args) {
    await yieldToEventLoop();
    const {
      Key, UpdateExpression, ConditionExpression,
      ExpressionAttributeNames: names, ExpressionAttributeValues: values, ReturnValues,
    } = args;
    const existing = table.get(keyOf(Key)) ?? null;
    const item = existing ?? {};
    if (!evalCondition(ConditionExpression, item, names, values)) {
      const err = new Error('The conditional request failed');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    const next = applyUpdate(item, UpdateExpression, names, values);
    table.set(keyOf(Key), { ...Key, ...next });
    if (ReturnValues === 'ALL_NEW') return next;
    if (ReturnValues === 'UPDATED_NEW') {
      const changed = {};
      for (const k of Object.keys(next)) {
        if (existing === null || JSON.stringify(existing[k]) !== JSON.stringify(next[k])) {
          changed[k] = next[k];
        }
      }
      return changed;
    }
    return {};
  }

  async function batchGet(args) {
    await yieldToEventLoop();
    return args.Keys.map((k) => table.get(keyOf(k)) ?? null).filter(Boolean);
  }

  return {
    _dump: () => [...table.values()],
    _table: table,
    _eval: (expr, item, names, values) => evalCondition(expr, item ?? {}, names ?? {}, values ?? {}),
    _lex: (expr) => {
      const p = new ExprTokenizer(expr);
      return p.tokens;
    },
    get,
    put,
    delete: del2,
    update,
    query,
    batchGet,
    transactWrite,
  };
}
