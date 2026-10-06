/*
 * OFX / CSV statement parser for FinAI.
 * Parses bank, credit card, loan, and benefit (VA/VR) statement files
 * into a unified list of imported transactions with deduplication hashes.
 */

export type ImportTarget = 'account' | 'card' | 'loan' | 'benefit';

export type ParsedTransaction = {
  date: string;           // YYYY-MM-DD
  amount: number;         // signed: positive = income/credit, negative = expense/debit
  description: string;
  type: 'income' | 'expense' | 'transfer';
  importHash: string;     // dedup key
  selected: boolean;      // user can deselect in preview
  duplicate: boolean;     // already exists in DB
};

export type ParseResult = {
  transactions: ParsedTransaction[];
  format: 'ofx' | 'csv';
  institutionHint?: string;
  accountHint?: string;
  balanceHint?: number;
};

/* ---- Hash ---- */
async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---- OFX Parser ----
 * OFX files are SGML-like. We extract <STMTTRN> blocks and their fields.
 */
function parseOFXDate(ofxDate: string): string {
  // OFX dates: YYYYMMDD or YYYYMMDDHHMMSS or YYYYMMDDHHMMSS.XXX[tz]
  const clean = ofxDate.trim().split('[')[0];
  if (clean.length >= 8) {
    return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function extractOFXField(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = block.match(regex);
  return m ? m[1].trim() : '';
}

export function parseOFX(content: string): ParseResult {
  const transactions: ParsedTransaction[] = [];

  // Extract institution / account hints
  const orgMatch = content.match(/<ORG>([^<\r\n]*)/i);
  const acctIdMatch = content.match(/<ACCTID>([^<\r\n]*)/i);
  const balanceMatch = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i);

  // Split by <STMTTRN> ... </STMTTRN>
  const stmtBlocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of stmtBlocks) {
    const endIdx = block.indexOf('</STMTTRN>');
    const raw = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const date = parseOFXDate(extractOFXField(raw, 'DTPOSTED'));
    const amountStr = extractOFXField(raw, 'TRNAMT');
    const amount = parseFloat(amountStr) || 0;
    const name = extractOFXField(raw, 'NAME') || extractOFXField(raw, 'MEMO') || 'Lançamento importado';
    const memo = extractOFXField(raw, 'MEMO');
    const description = memo ? `${name} ${memo}`.trim() : name;

    transactions.push({
      date,
      amount,
      description,
      type: amount >= 0 ? 'income' : 'expense',
      importHash: '', // filled below
      selected: true,
      duplicate: false,
    });
  }

  return {
    transactions,
    format: 'ofx',
    institutionHint: orgMatch?.[1]?.trim(),
    accountHint: acctIdMatch?.[1]?.trim(),
    balanceHint: balanceMatch ? parseFloat(balanceMatch[1]) : undefined,
  };
}

/* ---- CSV Parser ----
 * Supports common Brazilian bank CSV layouts. Auto-detects delimiter
 * (comma or semicolon) and identifies columns by header keywords.
 */
type CSVRow = string[];

function detectDelimiter(line: string): string {
  const semis = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semis > commas ? ';' : ',';
}

function parseCSVLine(line: string, delim: string): CSVRow {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === delim && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

// Parse Brazilian date formats: DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY
function parseCSVDate(raw: string): string {
  const s = raw.trim().replace(/["']/g, '');
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  // ISO fallback
  const iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  return new Date().toISOString().slice(0, 10);
}

// Parse Brazilian number format: "1.234,56" or "1234.56" or "-R$ 1.234,56"
function parseCSVAmount(raw: string): number {
  let s = raw.trim().replace(/["']/g, '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return 0;
  // If contains both . and , → Brazilian: . is thousands, , is decimal
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s) || 0;
}

const HEADER_KEYWORDS = {
  date: ['data', 'date', 'dt', 'dt_lanc', 'dt_mov', 'datalanc', 'datamov', 'data_transacao', 'data_trans'],
  description: ['descricao', 'historico', 'description', 'desc', 'lançamento', 'lancamento', 'memo', 'detalhe', 'estabelecimento', 'nome'],
  amount: ['valor', 'amount', 'montante', 'vlr', 'val', 'valor_transacao'],
};

function findColumn(headers: CSVRow, keywords: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const kw of keywords) {
    const idx = lower.findIndex(h => h === kw || h.includes(kw));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseCSV(content: string): ParseResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { transactions: [], format: 'csv' };

  const delim = detectDelimiter(lines[0]);

  // Find header row: look for a row containing date + amount or description keywords
  let headerRow = -1;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = parseCSVLine(lines[i], delim);
    const lower = cols.map(c => c.toLowerCase().trim());
    const hasDate = lower.some(c => HEADER_KEYWORDS.date.some(kw => c === kw || c.includes(kw)));
    const hasAmount = lower.some(c => HEADER_KEYWORDS.amount.some(kw => c === kw || c.includes(kw)));
    const hasDesc = lower.some(c => HEADER_KEYWORDS.description.some(kw => c === kw || c.includes(kw)));
    if (hasDate && (hasAmount || hasDesc)) { headerRow = i; break; }
    if (cols.length >= 2) { headerRow = i; break; }
  }

  if (headerRow === -1) return { transactions: [], format: 'csv' };

  const headers = parseCSVLine(lines[headerRow], delim);
  const dateCol = findColumn(headers, HEADER_KEYWORDS.date);
  const descCol = findColumn(headers, HEADER_KEYWORDS.description);
  const amountCol = findColumn(headers, HEADER_KEYWORDS.amount);

  const transactions: ParsedTransaction[] = [];

  // Determine data start: if header row had recognized keywords, start from headerRow+1
  // If no keywords found, treat headerRow as first data row
  const hasKeywords = dateCol >= 0 || amountCol >= 0 || descCol >= 0;
  const dataStart = hasKeywords ? headerRow + 1 : headerRow;

  for (let i = dataStart; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delim);
    if (cols.length < 2) continue;

    const dateRaw = dateCol >= 0 ? cols[dateCol] : cols[0];
    const descRaw = descCol >= 0 ? cols[descCol] : cols.length > 2 ? cols[1] : '';
    const amountRaw = amountCol >= 0 ? cols[amountCol] : cols[cols.length - 1];

    // Skip if all empty
    if (!dateRaw.trim() && !amountRaw.trim() && !descRaw.trim()) continue;
    // Skip lines that look like the header (e.g. "Data,Valor,Descricao")
    if (dateRaw.toLowerCase().includes('data') && amountRaw.toLowerCase().includes('valor')) continue;

    if (!dateRaw && !amountRaw) continue;

    const date = parseCSVDate(dateRaw);
    const amount = parseCSVAmount(amountRaw);
    const description = descRaw || 'Lançamento importado';

    transactions.push({
      date,
      amount,
      description,
      type: amount >= 0 ? 'income' : 'expense',
      importHash: '',
      selected: true,
      duplicate: false,
    });
  }

  return { transactions, format: 'csv' };
}

/* ---- Main entry point ---- */
export async function parseStatementFile(fileName: string, content: string): Promise<ParseResult> {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  // Detect format by content first, then fall back to extension
  const isOFX = content.includes('<OFX>') || content.includes('<OFXSGML>') || content.includes('<STMTTRN>') || ext === 'ofx' || ext === 'qfx';
  let result: ParseResult;

  if (isOFX) {
    result = parseOFX(content);
  } else {
    result = parseCSV(content);
  }

  // Fill import hashes
  for (const t of result.transactions) {
    t.importHash = await sha256(`${t.date}|${t.amount}|${t.description}`);
  }

  return result;
}
