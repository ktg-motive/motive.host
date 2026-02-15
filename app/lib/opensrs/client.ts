import { createHash } from 'crypto';
import type { OpenSRSConfig, OpenSRSResponse, XCPRequest, XCPValue, XCPAssoc, XCPArray } from './types';
import { OpenSRSError } from './types';

const ENDPOINTS = {
  test: 'https://horizon.opensrs.net:55443',
  live: 'https://rr-n1-tor.opensrs.net:55443',
} as const;

// ─── XML Builder ─────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serializeValue(value: XCPValue): string {
  if (typeof value === 'string') return escapeXml(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Array.isArray(value)) return serializeArray(value);
  if (typeof value === 'object' && value !== null) return serializeAssoc(value);
  return '';
}

function serializeAssoc(obj: XCPAssoc): string {
  const items = Object.entries(obj)
    .map(([key, val]) => `<item key="${escapeXml(key)}">${serializeValue(val)}</item>`)
    .join('');
  return `<dt_assoc>${items}</dt_assoc>`;
}

function serializeArray(arr: XCPArray): string {
  const items = arr
    .map((val, i) => `<item key="${i}">${serializeValue(val)}</item>`)
    .join('');
  return `<dt_array>${items}</dt_array>`;
}

export function buildXml(request: XCPRequest): string {
  const body = serializeAssoc({
    protocol: 'XCP',
    action: request.action,
    object: request.object,
    attributes: request.attributes as XCPAssoc,
  });

  return [
    `<?xml version='1.0' encoding='UTF-8' standalone='no'?>`,
    `<!DOCTYPE OPS_envelope SYSTEM 'ops.dtd'>`,
    `<OPS_envelope>`,
    `<header><version>0.9</version></header>`,
    `<body><data_block>${body}</data_block></body>`,
    `</OPS_envelope>`,
  ].join('');
}

// ─── XML Parser ──────────────────────────────────────────────────────────────

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

interface ParseContext {
  xml: string;
  pos: number;
}

function skipWhitespace(ctx: ParseContext): void {
  while (ctx.pos < ctx.xml.length && /\s/.test(ctx.xml[ctx.pos])) {
    ctx.pos++;
  }
}

function expect(ctx: ParseContext, str: string): void {
  if (!ctx.xml.startsWith(str, ctx.pos)) {
    throw new Error(`Expected "${str}" at position ${ctx.pos}, got "${ctx.xml.substring(ctx.pos, ctx.pos + 20)}"`);
  }
  ctx.pos += str.length;
}

function readUntil(ctx: ParseContext, delimiter: string): string {
  const idx = ctx.xml.indexOf(delimiter, ctx.pos);
  if (idx === -1) throw new Error(`Could not find "${delimiter}" from position ${ctx.pos}`);
  const result = ctx.xml.substring(ctx.pos, idx);
  ctx.pos = idx;
  return result;
}

function parseValue(ctx: ParseContext): XCPValue {
  skipWhitespace(ctx);

  if (ctx.xml.startsWith('<dt_assoc>', ctx.pos)) {
    return parseAssoc(ctx);
  }
  if (ctx.xml.startsWith('<dt_array>', ctx.pos)) {
    return parseArray(ctx);
  }

  // Plain text value until next tag
  const text = readUntil(ctx, '<');
  return unescapeXml(text);
}

function parseAssoc(ctx: ParseContext): XCPAssoc {
  expect(ctx, '<dt_assoc>');
  const result: XCPAssoc = {};

  while (true) {
    skipWhitespace(ctx);
    if (ctx.xml.startsWith('</dt_assoc>', ctx.pos)) {
      ctx.pos += '</dt_assoc>'.length;
      return result;
    }

    // Parse <item key="...">
    expect(ctx, '<item key="');
    const key = readUntil(ctx, '"');
    ctx.pos++; // skip closing quote
    expect(ctx, '>');

    // Check for self-closing or empty
    skipWhitespace(ctx);
    if (ctx.xml.startsWith('</item>', ctx.pos)) {
      result[key] = '';
      ctx.pos += '</item>'.length;
      continue;
    }

    result[key] = parseValue(ctx);

    skipWhitespace(ctx);
    expect(ctx, '</item>');
  }
}

function parseArray(ctx: ParseContext): XCPArray {
  expect(ctx, '<dt_array>');
  const items: Array<{ index: number; value: XCPValue }> = [];

  while (true) {
    skipWhitespace(ctx);
    if (ctx.xml.startsWith('</dt_array>', ctx.pos)) {
      ctx.pos += '</dt_array>'.length;
      break;
    }

    expect(ctx, '<item key="');
    const key = readUntil(ctx, '"');
    ctx.pos++;
    expect(ctx, '>');

    skipWhitespace(ctx);
    let value: XCPValue = '';
    if (!ctx.xml.startsWith('</item>', ctx.pos)) {
      value = parseValue(ctx);
    }

    skipWhitespace(ctx);
    expect(ctx, '</item>');
    items.push({ index: parseInt(key, 10), value });
  }

  // Build array in order
  const result: XCPArray = [];
  for (const item of items.sort((a, b) => a.index - b.index)) {
    result[item.index] = item.value;
  }
  return result;
}

export function parseXml(xml: string): OpenSRSResponse {
  // Extract the data_block content
  const dataBlockStart = xml.indexOf('<data_block>');
  const dataBlockEnd = xml.indexOf('</data_block>');
  if (dataBlockStart === -1 || dataBlockEnd === -1) {
    throw new Error('Invalid OpenSRS response: missing data_block');
  }

  const inner = xml.substring(dataBlockStart + '<data_block>'.length, dataBlockEnd);
  const ctx: ParseContext = { xml: inner, pos: 0 };

  skipWhitespace(ctx);
  const data = parseAssoc(ctx) as Record<string, XCPValue>;

  const isSuccess = data.is_success === '1' || data.is_success === 1;
  const responseCode = typeof data.response_code === 'string'
    ? parseInt(data.response_code, 10)
    : (data.response_code as number) ?? 0;
  const responseText = (data.response_text as string) ?? '';
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;

  return { isSuccess, responseCode, responseText, attributes };
}

// ─── Signature ───────────────────────────────────────────────────────────────

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function computeSignature(xml: string, apiKey: string): string {
  return md5(md5(xml + apiKey) + apiKey);
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OpenSRSClient {
  private readonly config: OpenSRSConfig;
  private readonly endpoint: string;

  constructor(config: OpenSRSConfig) {
    this.config = config;
    this.endpoint = ENDPOINTS[config.environment];
  }

  async request<T = Record<string, unknown>>(request: XCPRequest): Promise<OpenSRSResponse<T>> {
    const xml = buildXml(request);
    const signature = computeSignature(xml, this.config.apiKey);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'X-Username': this.config.username,
        'X-Signature': signature,
        'Content-Length': Buffer.byteLength(xml, 'utf-8').toString(),
      },
      body: xml,
    });

    if (!response.ok) {
      throw new OpenSRSError(response.status, `HTTP error: ${response.statusText}`);
    }

    const responseXml = await response.text();
    const parsed = parseXml(responseXml) as OpenSRSResponse<T>;

    if (!parsed.isSuccess) {
      throw new OpenSRSError(parsed.responseCode, parsed.responseText);
    }

    return parsed;
  }
}
