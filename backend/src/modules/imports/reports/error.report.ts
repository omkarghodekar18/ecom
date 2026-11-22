// Error report generator (spec 16.1 step 3): an .xlsx the admin can download
// after a dry run — the original rows with an appended "Errors" column, one
// line per issue, so the file can be fixed and re-uploaded directly.
import ExcelJS from 'exceljs';
import type { ParsedWorkbook } from '../parsers/import.parser.js';
import type { ImportIssueDraft } from '../imports.errors.js';

/** Builds the report from the parsed workbook + collected issues. */
export async function generateErrorReport(parsed: ParsedWorkbook, issues: ImportIssueDraft[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ToolHub India — Import Center';

  // Issues summary sheet: totals grouped by code.
  const summary = workbook.addWorksheet('Summary');
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 12;
  summary.getColumn(3).width = 10;
  summary.getColumn(4).width = 90;
  summary.getRow(1).values = ['Code', 'Severity', 'Count', 'Message'];
  summary.getRow(1).font = { bold: true };
  const grouped = new Map<string, { severity: string; count: number; message: string }>();
  for (const item of issues) {
    const entry = grouped.get(item.code) ?? { severity: item.severity, count: 0, message: item.message };
    entry.count += 1;
    grouped.set(item.code, entry);
  }
  for (const [code, entry] of grouped) {
    summary.addRow([code, entry.severity, entry.count, entry.message]);
  }

  // One sheet per parsed sheet with the original rows + "Errors" column.
  for (const [sheetName, sheet] of Object.entries(parsed.sheets)) {
    if (sheet.rows.length === 0) continue;
    const out = workbook.addWorksheet(sheetName.slice(0, 31));
    out.columns = [...sheet.headers, 'Errors'].map((header) => ({ header, key: header, width: 20 }));
    out.getRow(1).font = { bold: true };
    const issuesByRow = new Map<number, ImportIssueDraft[]>();
    for (const item of issues) {
      if (item.sheet !== sheetName) continue;
      issuesByRow.set(item.rowNumber, [...(issuesByRow.get(item.rowNumber) ?? []), item]);
    }
    for (const row of sheet.rows) {
      const record: Record<string, string> = {};
      for (const header of sheet.headers) {
        record[header] = row.cells[header]?.raw ?? '';
      }
      const rowIssues = issuesByRow.get(row.rowNumber) ?? [];
      record['Errors'] = rowIssues.map((item) => `${item.severity} ${item.code}${item.column !== undefined ? ` (${item.column})` : ''}: ${item.message}`).join('\n');
      out.addRow(record);
    }
    out.getColumn('Errors').width = 60;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
