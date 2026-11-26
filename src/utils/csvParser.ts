import type { CsvTableData, Student, StudentGroup } from '../types/classroom';

export const SAMPLE_STUDENT_NAMES = [
  '陳冠宇',
  '林雅婷',
  '張哲瑋',
  '王思涵',
  '李宗翰',
  '黃品妍',
  '吳柏均',
  '劉佳穎',
  '蔡承恩',
  '楊筑鈞',
  '許家豪',
  '鄭怡君',
  '謝宇軒',
  '郭芷瑄',
  '曾柏霖',
  '洪子晴',
  '邱俊傑',
  '周筱涵',
  '葉秉叡',
  '江珮琪',
  '呂彥廷',
  '潘依晨',
  '蘇子翔',
  '范羽彤',
];

const HEADER_KEYWORDS = [
  '姓名',
  '學生姓名',
  '名字',
  '學生',
  '全名',
  'name',
  'student',
  'student name',
  'full name',
];

const NON_NAME_HEADERS = [
  '座號',
  '學號',
  '班級',
  '組別',
  '備註',
  'id',
  'no',
  'number',
  'class',
  'email',
  '信箱',
];

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function decodeUploadedFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8Text = utf8Decoder.decode(buffer);

  // If UTF-8 produced replacement characters, try Big5 (common in Taiwan Excel CSV exports)
  if (utf8Text.includes('\uFFFD')) {
    try {
      const big5Decoder = new TextDecoder('big5', { fatal: false });
      const big5Text = big5Decoder.decode(buffer);
      const utf8Bad = (utf8Text.match(/\uFFFD/g) || []).length;
      const big5Bad = (big5Text.match(/\uFFFD/g) || []).length;
      if (big5Bad < utf8Bad) {
        return big5Text.replace(/^\uFEFF/, '');
      }
    } catch {
      // Fallback to UTF-8 if Big5 is unavailable
    }
  }

  return utf8Text.replace(/^\uFEFF/, '');
}

export function parseCsvToTable(rawText: string, fileName: string): CsvTableData {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      suggestedColumnIndex: 0,
      fileName,
    };
  }

  // Detect delimiter from first few lines
  const sample = lines.slice(0, 5).join('\n');
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount >= semiCount) delimiter = '\t';
  else if (semiCount > commaCount) delimiter = ';';

  const parsedRows = lines.map((line) => parseCsvLine(line, delimiter));
  const maxCols = Math.max(...parsedRows.map((r) => r.length));

  // Single-column CSV
  if (maxCols <= 1) {
    const firstVal = parsedRows[0][0]?.toLowerCase() ?? '';
    const hasHeader = HEADER_KEYWORDS.some((kw) => firstVal === kw);
    const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;
    return {
      headers: [hasHeader ? parsedRows[0][0] : '學生姓名'],
      rows: dataRows,
      suggestedColumnIndex: 0,
      fileName,
    };
  }

  // Multi-column CSV: check if row 0 looks like a header
  const firstRow = parsedRows[0];
  const looksLikeHeader = firstRow.some((cell) => {
    const lower = cell.toLowerCase();
    return (
      HEADER_KEYWORDS.some((kw) => lower.includes(kw)) ||
      NON_NAME_HEADERS.some((kw) => lower === kw || lower.includes(kw))
    );
  });

  const headers = looksLikeHeader
    ? firstRow.map((cell, idx) => cell || `欄位 ${idx + 1}`)
    : firstRow.map((_, idx) => `欄位 ${idx + 1}`);

  const dataRows = looksLikeHeader ? parsedRows.slice(1) : parsedRows;

  // Suggest best column for student names
  let suggestedColumnIndex = 0;
  const headerMatchIdx = headers.findIndex((h) =>
    HEADER_KEYWORDS.some((kw) => h.toLowerCase().includes(kw))
  );

  if (headerMatchIdx >= 0) {
    suggestedColumnIndex = headerMatchIdx;
  } else {
    // Pick first column that isn't purely numeric
    const nonNumericIdx = headers.findIndex((_, colIdx) => {
      const sampleVals = dataRows
        .slice(0, 8)
        .map((r) => r[colIdx] ?? '')
        .filter(Boolean);
      if (sampleVals.length === 0) return false;
      const numericCount = sampleVals.filter((v) => /^\d+$/.test(v)).length;
      return numericCount < sampleVals.length / 2;
    });
    if (nonNumericIdx >= 0) {
      suggestedColumnIndex = nonNumericIdx;
    }
  }

  return {
    headers,
    rows: dataRows,
    suggestedColumnIndex,
    fileName,
  };
}

export function extractNamesFromColumn(
  table: CsvTableData,
  columnIndex: number
): string[] {
  return table.rows
    .map((row) => (row[columnIndex] ?? '').trim())
    .filter((name) => name.length > 0);
}

export function parsePastedNames(rawText: string): string[] {
  if (!rawText.trim()) return [];
  // Support newlines, commas, Chinese enumeration commas (、), Chinese commas (，), tabs, semicolons
  const tokens = rawText
    .replace(/\r\n/g, '\n')
    .split(/[\n,，、;\t]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return tokens;
}

export function buildStudentsFromNames(names: string[]): Student[] {
  return names.map((name, index) => ({
    id: `stu-${index + 1}-${name}-${Math.random().toString(36).slice(2, 7)}`,
    seatNumber: index + 1,
    name,
    present: true,
  }));
}

export function exportGroupsToCsv(groups: StudentGroup[]): string {
  const lines = ['組別,座號,學生姓名'];
  groups.forEach((group) => {
    group.members.forEach((member) => {
      const safeName = `"${member.name.replace(/"/g, '""')}"`;
      lines.push(`第 ${group.index} 組,${member.seatNumber},${safeName}`);
    });
  });
  return '\uFEFF' + lines.join('\n');
}

export function formatGroupsAsText(groups: StudentGroup[]): string {
  return groups
    .map((group) => {
      const memberList = group.members
        .map((m) => `${String(m.seatNumber).padStart(2, '0')} ${m.name}`)
        .join('、');
      return `【第 ${group.index} 組】（${group.members.length} 人）：${memberList}`;
    })
    .join('\n');
}
