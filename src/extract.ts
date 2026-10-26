import { fromMarkdown } from 'mdast-util-from-markdown';
import { classify } from './normalize';

export interface Candidate {
  start: number;
  end: number;
  destination: string;
  destinationStart: number;
  destinationEnd: number;
}
interface Node {
  type: string;
  identifier?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
interface Destination { value: string; start: number; end: number; close: number }
const identifier = (s: string) => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1').trim().replace(/\s+/g, ' ').toLowerCase();

function labelEnd(text: string, start: number, end: number): number {
  let depth = 1;
  for (let i = start + 1; i < end; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '[') depth++;
    if (text[i] === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Read a destination from source, retaining native backslashes and literal %/#.
// This scanner is used only at AST link/definition or text-node positions.
function destination(text: string, offset: number, limit: number, inline: boolean): Destination | undefined {
  let start = offset;
  while (start < limit && /\s/.test(text[start])) start++;
  if (text[start] === '<') {
    const end = text.indexOf('>', start + 1);
    if (end < 0 || end >= limit || /[\r\n]/.test(text.slice(start + 1, end))) return;
    const tail = text.slice(end + 1, limit);
    const m = inline ? /^\s*(?:(?:"[^"]*"|'[^']*'|\([^)]*\))\s*)?\)/.exec(tail) : /^\s*(?:"[\s\S]*"|'[\s\S]*'|\([\s\S]*\))?\s*$/.exec(tail);
    if (!m) return;
    return { value: text.slice(start + 1, end), start: start + 1, end, close: inline ? end + 1 + m[0].length : limit };
  }
  let end = limit;
  if (inline) {
    let depth = 0;
    let quote = '';
    for (let i = start; i < limit; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = ''; continue; }
      if ((c === '"' || c === "'") && /\s/.test(text[i - 1] ?? '')) { quote = c; continue; }
      if (c === '(') depth++;
      if (c === ')') { if (!depth) { end = i; break; } depth--; }
    }
    if (end === limit) return;
  }
  const raw = text.slice(start, end);
  const title = /\s+(?:"[\s\S]*"|'[\s\S]*'|\([^)]*\))\s*$/.exec(raw);
  const value = (title ? raw.slice(0, title.index) : raw).trimEnd();
  if (!value) return;
  return { value, start, end: start + value.length, close: inline ? end + 1 : limit };
}

export function extract(text: string, cancelled: () => boolean = () => false): Candidate[] {
  if (cancelled()) return [];
  let tree = fromMarkdown(text) as Node;
  // Recover native reference definitions which the Markdown grammar rejects.
  // Only AST text nodes at a legal definition line start are examined. A shadow
  // parse replaces just that destination with equal-length safe characters, so
  // reference matching and every source offset still come from the tokenizer.
  const replacements: Destination[] = [];
  function recoverDefinitions(node: Node): void {
    if (cancelled() || ['code', 'inlineCode', 'html', 'image', 'imageReference', 'blockquote', 'link'].includes(node.type)) return;
    if (node.type === 'text') {
      const end = node.position!.end.offset!;
      for (let i = node.position!.start.offset!; i < end; i++) {
        if (text[i] !== '[') continue;
        const lineStart = text.lastIndexOf('\n', i - 1) + 1;
        if (!/^ {0,3}$/.test(text.slice(lineStart, i))) continue;
        const close = labelEnd(text, i, end);
        if (close < 0) break;
        if (text[close + 1] !== ':') continue;
        const newline = text.indexOf('\n', close);
        const lineEnd = newline < 0 ? text.length : newline;
        const d = destination(text, close + 2, lineEnd, false);
        if (d && ['drive', 'unc'].includes(classify(d.value))) replacements.push(d);
      }
    }
    node.children?.forEach(recoverDefinitions);
  }
  recoverDefinitions(tree);
  if (replacements.length) {
    let shadow = text;
    for (const d of replacements.sort((a, b) => b.start - a.start)) shadow = shadow.slice(0, d.start) + 'x'.repeat(d.end - d.start) + shadow.slice(d.end);
    tree = fromMarkdown(shadow) as Node;
  }
  const definitions = new Map<string, Destination>();
  const inlineNodes: Node[] = [];
  const inlineLimits = new Map<Node, number>();
  const textNodes: Node[] = [];
  const references: Node[] = [];
  const blocked: number[] = [];
  function visit(node: Node, parentEnd = text.length): void {
    if (cancelled()) return;
    if (['code', 'inlineCode', 'html', 'image', 'imageReference', 'blockquote'].includes(node.type)) {
      if (node.position?.start.offset !== undefined) blocked.push(node.position.start.offset);
      return;
    }
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (node.type === 'definition') {
        const close = labelEnd(text, start, end);
        const d = close >= 0 ? destination(text, close + 2, end, false) : undefined;
        const id = identifier(node.identifier!);
        if (d && !definitions.has(id)) definitions.set(id, d);
      } else if (node.type === 'link') { inlineNodes.push(node); inlineLimits.set(node, parentEnd); return; }
      else if (node.type === 'linkReference') { references.push(node); return; }
      else if (node.type === 'text') textNodes.push(node);
    }
    node.children?.forEach(child => visit(child, node.position?.end.offset ?? parentEnd));
  }
  visit(tree);
  blocked.sort((a, b) => a - b);
  if (cancelled()) return [];
  const result: Candidate[] = [];
  const add = (d: Destination, start: number, end: number) => {
    if (['drive', 'unc', 'ambiguous-native', 'drive-relative'].includes(classify(d.value))) {
      result.push({ start, end, destination: d.value, destinationStart: d.start, destinationEnd: d.end });
    }
  };
  for (const node of inlineNodes) {
    const start = node.position!.start.offset!, end = node.position!.end.offset!;
    const close = labelEnd(text, start, end);
    if (close >= 0 && text[close + 1] === '(') {
      let low = 0, high = blocked.length;
      while (low < high) { const middle = (low + high) >>> 1; if (blocked[middle] < end) low = middle + 1; else high = middle; }
      const limit = Math.min(inlineLimits.get(node) ?? end, blocked[low] ?? text.length);
      const d = destination(text, close + 2, limit, true);
      if (d) add(d, d.start, d.end);
    }
  }
  for (const node of references) {
    const d = definitions.get(identifier(node.identifier!));
    if (d) add(d, node.position!.start.offset!, node.position!.end.offset!);
  }
  for (const d of definitions.values()) add(d, d.start, d.end);
  // Narrow recovery: only AST text nodes, never code, HTML, images or parsed links.
  // Handles native Windows spaces/parentheses rejected by the Markdown grammar.
  for (const node of textNodes) {
    const end = node.position!.end.offset!;
    for (let i = node.position!.start.offset!; i < end && !cancelled(); i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] !== '[' || text[i - 1] === '!') continue;
      const close = labelEnd(text, i, end);
      if (close < 0) break;
      if (text[close + 1] !== '(') continue;
      const d = destination(text, close + 2, end, true);
      if (d && ['drive', 'unc', 'ambiguous-native'].includes(classify(d.value))) {
        add(d, d.start, d.end); i = d.close - 1;
      }
    }
  }
  return cancelled() ? [] : result.sort((a, b) => a.start - b.start).filter((c, i, all) => !i || c.start !== all[i - 1].start || c.end !== all[i - 1].end);
}
