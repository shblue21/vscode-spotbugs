import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Finding } from '../model/finding';

export const SUPPRESSION_FILE_NAME = 'spotbugs-suppressions.xml';
export const SUPPRESSION_FALLBACK_FILE_NAME =
  'spotbugs-managed-suppressions.xml';
export const MANAGED_SUPPRESSION_MARKER =
  '<!-- Managed by vscode-spotbugs; format-version: 1. -->';

const FILE_PREFIX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  MANAGED_SUPPRESSION_MARKER,
  '<FindBugsFilter>',
  '',
].join('\n');
const FILE_SUFFIX = '</FindBugsFilter>\n';
const XML_ATTRIBUTE = '(?:[^"&<>]|&(?:amp|quot|lt|gt|apos);)*';
const MATCH_BLOCK = new RegExp(
  `  <Match>\\n    <Class name="${XML_ATTRIBUTE}" \\/>\\n` +
    `(?:    (?:<Field name="${XML_ATTRIBUTE}" \\/>|<Method name="${XML_ATTRIBUTE}"(?: params="${XML_ATTRIBUTE}" returns="${XML_ATTRIBUTE}")? \\/>)\\n)?` +
    `    <Bug pattern="${XML_ATTRIBUTE}" \\/>\\n  <\\/Match>\\n`,
  'g'
);

const DESCRIPTOR_PRIMITIVE_TYPES = new Map<string, string>([
  ['B', 'byte'],
  ['C', 'char'],
  ['D', 'double'],
  ['F', 'float'],
  ['I', 'int'],
  ['J', 'long'],
  ['S', 'short'],
  ['Z', 'boolean'],
]);

type SuppressionMember =
  | {
      kind: 'method';
      name: string;
      params?: string;
      returns?: string;
    }
  | { kind: 'field'; name: string };

interface SuppressionRule {
  pattern: string;
  className: string;
  member?: SuppressionMember;
}

export interface SuppressionPlan {
  blocks: string[];
  selectedCount: number;
  matchedCount: number;
  additionalCount: number;
}

export type SuppressionPlanResult =
  | { ok: true; value: SuppressionPlan }
  | { ok: false; unsupportedCount: number };

export type ManagedSuppressionFileState =
  | { kind: 'missing'; filePath: string }
  | { kind: 'conflict'; filePath: string }
  | { kind: 'invalid'; filePath: string }
  | {
      kind: 'managed';
      filePath: string;
      content: string;
      blocks: string[];
    };

export class SuppressionFileChangedError extends Error {
  constructor(filePath: string) {
    super(`Suppression file changed while it was being updated: ${filePath}`);
    this.name = 'SuppressionFileChangedError';
  }
}

export function createSuppressionPlan(
  selectedFindings: Finding[],
  cachedFindings: Finding[]
): SuppressionPlanResult {
  const rulesByBlock = new Map<string, SuppressionRule>();
  let unsupportedCount = 0;

  for (const finding of selectedFindings) {
    const rule = ruleForFinding(finding);
    if (!rule) {
      unsupportedCount += 1;
      continue;
    }
    rulesByBlock.set(serializeSuppressionBlock(rule), rule);
  }
  if (unsupportedCount > 0 || rulesByBlock.size === 0) {
    return { ok: false, unsupportedCount };
  }

  const rules = [...rulesByBlock.values()];
  const selected = new Set(selectedFindings);
  const matched = cachedFindings.filter((finding) =>
    rules.some((rule) => matchesSuppressionRule(finding, rule))
  );
  return {
    ok: true,
    value: {
      blocks: [...rulesByBlock.keys()],
      selectedCount: selectedFindings.length,
      matchedCount: matched.length,
      additionalCount: matched.filter((finding) => !selected.has(finding)).length,
    },
  };
}

export function matchesSuppressionRule(
  finding: Finding,
  rule: SuppressionRule
): boolean {
  if (
    finding.type?.trim() !== rule.pattern ||
    finding.className?.trim() !== rule.className
  ) {
    return false;
  }
  if (!rule.member) {
    return true;
  }
  if (rule.member.kind === 'field') {
    return finding.fieldName?.trim() === rule.member.name;
  }
  if (finding.methodName?.trim() !== rule.member.name) {
    return false;
  }
  if (rule.member.params === undefined || rule.member.returns === undefined) {
    return true;
  }

  const descriptor = parseMethodDescriptor(finding.methodSignature);
  return (
    descriptor?.params.join(',') === rule.member.params &&
    descriptor.returns === rule.member.returns
  );
}

function parseMethodDescriptor(
  signature: string | undefined
): { params: string[]; returns: string } | undefined {
  if (!signature?.startsWith('(')) {
    return undefined;
  }

  let index = 1;
  const params: string[] = [];
  while (index < signature.length && signature[index] !== ')') {
    const parsed = parseDescriptorType(signature, index, false);
    if (!parsed) {
      return undefined;
    }
    params.push(parsed.type);
    index = parsed.nextIndex;
  }
  if (signature[index] !== ')') {
    return undefined;
  }

  const returnType = parseDescriptorType(signature, index + 1, true);
  return returnType?.nextIndex === signature.length
    ? { params, returns: returnType.type }
    : undefined;
}

function serializeSuppressionBlock(rule: SuppressionRule): string {
  const lines = [
    '  <Match>',
    `    <Class name="${escapeXmlAttribute(rule.className)}" />`,
  ];
  if (rule.member?.kind === 'field') {
    lines.push(`    <Field name="${escapeXmlAttribute(rule.member.name)}" />`);
  } else if (rule.member?.kind === 'method') {
    const signature =
      rule.member.params !== undefined && rule.member.returns !== undefined
        ? ` params="${escapeXmlAttribute(
            rule.member.params
          )}" returns="${escapeXmlAttribute(rule.member.returns)}"`
        : '';
    lines.push(
      `    <Method name="${escapeXmlAttribute(rule.member.name)}"${signature} />`
    );
  }
  lines.push(`    <Bug pattern="${escapeXmlAttribute(rule.pattern)}" />`);
  lines.push('  </Match>');
  return `${lines.join('\n')}\n`;
}

export function serializeManagedSuppressionFile(blocks: string[]): string {
  return `${FILE_PREFIX}${blocks.join('')}${FILE_SUFFIX}`;
}

export async function inspectManagedSuppressionFile(
  filePath: string
): Promise<ManagedSuppressionFileState> {
  const content = await readOptionalFile(filePath);
  if (content === undefined) {
    return { kind: 'missing', filePath };
  }
  if (!content.includes(MANAGED_SUPPRESSION_MARKER)) {
    return { kind: 'conflict', filePath };
  }
  const blocks = parseManagedSuppressionBlocks(content);
  return blocks
    ? { kind: 'managed', filePath, content, blocks }
    : { kind: 'invalid', filePath };
}

export async function writeManagedSuppressionFile(
  filePath: string,
  expectedContent: string | undefined,
  blocks: string[]
): Promise<void> {
  if ((await readOptionalFile(filePath)) !== expectedContent) {
    throw new SuppressionFileChangedError(filePath);
  }

  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  await fs.promises.writeFile(
    temporaryPath,
    serializeManagedSuppressionFile(blocks),
    { encoding: 'utf8', flag: 'wx' }
  );

  try {
    if ((await readOptionalFile(filePath)) !== expectedContent) {
      throw new SuppressionFileChangedError(filePath);
    }
    await fs.promises.rename(temporaryPath, filePath);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true });
  }
}

function ruleForFinding(finding: Finding): SuppressionRule | undefined {
  const pattern = finding.type?.trim();
  const className = finding.className?.trim();
  if (!pattern || !className) {
    return undefined;
  }

  const fieldName = finding.fieldName?.trim();
  if (fieldName) {
    return { pattern, className, member: { kind: 'field', name: fieldName } };
  }
  const methodName = finding.methodName?.trim();
  if (!methodName) {
    return { pattern, className };
  }
  const descriptor = parseMethodDescriptor(finding.methodSignature);
  return {
    pattern,
    className,
    member: descriptor
      ? {
          kind: 'method',
          name: methodName,
          params: descriptor.params.join(','),
          returns: descriptor.returns,
        }
      : { kind: 'method', name: methodName },
  };
}

function parseDescriptorType(
  signature: string,
  startIndex: number,
  allowVoid: boolean
): { type: string; nextIndex: number } | undefined {
  let index = startIndex;
  let dimensions = 0;
  while (signature[index] === '[') {
    dimensions += 1;
    index += 1;
  }

  const marker = signature[index];
  const primitive = DESCRIPTOR_PRIMITIVE_TYPES.get(marker ?? '');
  let type: string | undefined;
  let nextIndex: number;
  if (primitive) {
    type = primitive;
    nextIndex = index + 1;
  } else if (marker === 'V' && allowVoid && dimensions === 0) {
    type = 'void';
    nextIndex = index + 1;
  } else if (marker === 'L') {
    const endIndex = signature.indexOf(';', index + 1);
    if (endIndex < 0 || endIndex === index + 1) {
      return undefined;
    }
    type = signature.slice(index + 1, endIndex).replace(/\//g, '.');
    nextIndex = endIndex + 1;
  } else {
    return undefined;
  }
  return { type: `${type}${'[]'.repeat(dimensions)}`, nextIndex };
}

function parseManagedSuppressionBlocks(content: string): string[] | undefined {
  const normalized = `${content.replace(/\r\n?/g, '\n').trimEnd()}\n`;
  if (!normalized.startsWith(FILE_PREFIX) || !normalized.endsWith(FILE_SUFFIX)) {
    return undefined;
  }

  const body = normalized.slice(FILE_PREFIX.length, -FILE_SUFFIX.length);
  const blocks = body.match(MATCH_BLOCK) ?? [];
  return blocks.join('') === body ? blocks : undefined;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;');
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
