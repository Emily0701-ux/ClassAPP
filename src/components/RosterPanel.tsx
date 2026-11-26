import React, { useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  UserCheck,
  UserX,
  Trash2,
  ClipboardPaste,
  Users,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { CsvTableData, Student } from '../types/classroom';
import {
  SAMPLE_STUDENT_NAMES,
  decodeUploadedFile,
  extractNamesFromColumn,
  parseCsvToTable,
  parsePastedNames,
} from '../utils/csvParser';

interface RosterPanelProps {
  students: Student[];
  drawnStudentIds: Set<string>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pasteInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onUpdateStudents: (names: string[]) => void;
  onTogglePresent: (studentId: string) => void;
  onRemoveStudent: (studentId: string) => void;
  onSetAllPresent: () => void;
  onClearStudents: () => void;
  onLoadSample: () => void;
  onRemoveDuplicates: () => void;
}

export const RosterPanel: React.FC<RosterPanelProps> = ({
  students,
  drawnStudentIds,
  fileInputRef,
  pasteInputRef,
  onUpdateStudents,
  onTogglePresent,
  onRemoveStudent,
  onSetAllPresent,
  onClearStudents,
  onLoadSample,
  onRemoveDuplicates,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [csvTable, setCsvTable] = useState<CsvTableData | null>(null);
  const [selectedCol, setSelectedCol] = useState<number>(0);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  const presentCount = students.filter((s) => s.present).length;
  const detectedPasteCount = parsePastedNames(pasteText).length;

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach((s) => {
      const key = s.name.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [students]);

  const duplicateExtraCount = useMemo(() => {
    let extra = 0;
    nameCounts.forEach((count) => {
      if (count > 1) extra += count - 1;
    });
    return extra;
  }, [nameCounts]);

  const handleFileProcess = async (file: File) => {
    setErrorMsg(null);
    setImportNotice(null);

    if (!file.name.match(/\.(csv|txt)$/i) && !file.type.includes('text') && !file.type.includes('csv')) {
      setErrorMsg('請上傳 .csv 或 .txt 格式的學生名單檔案。');
      return;
    }

    try {
      const text = await decodeUploadedFile(file);
      const table = parseCsvToTable(text, file.name);
      if (table.rows.length === 0) {
        setErrorMsg('檔案中找不到有效的學生資料。');
        return;
      }

      const colIdx = table.suggestedColumnIndex;
      const names = extractNamesFromColumn(table, colIdx);
      if (names.length === 0) {
        setErrorMsg('所選欄位沒有學生姓名，請嘗試切換其他欄位。');
        setCsvTable(table);
        setSelectedCol(colIdx);
        return;
      }

      setCsvTable(table.headers.length > 1 ? table : null);
      setSelectedCol(colIdx);
      onUpdateStudents(names);
      setPasteText(names.join('\n'));
      setImportNotice(`已從 ${file.name} 匯入 ${names.length} 位學生`);
    } catch {
      setErrorMsg('讀取檔案失敗，請確認檔案未損毀或改用直接貼上名單。');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileProcess(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileProcess(file);
    }
  };

  const handleColumnChange = (colIdx: number) => {
    if (!csvTable) return;
    setSelectedCol(colIdx);
    const names = extractNamesFromColumn(csvTable, colIdx);
    if (names.length > 0) {
      onUpdateStudents(names);
      setPasteText(names.join('\n'));
      setImportNotice(
        `已切換欄位「${csvTable.headers[colIdx]}」，共 ${names.length} 位學生`
      );
      setErrorMsg(null);
    }
  };

  const handleApplyPaste = () => {
    setErrorMsg(null);
    const names = parsePastedNames(pasteText);
    if (names.length === 0) {
      setErrorMsg('請先輸入或貼上至少一位學生姓名。');
      return;
    }
    setCsvTable(null);
    onUpdateStudents(names);
    setImportNotice(`已套用 ${names.length} 位學生名單`);
  };

  const handleAppendSample = () => {
    setErrorMsg(null);
    setCsvTable(null);
    onLoadSample();
    setPasteText(SAMPLE_STUDENT_NAMES.join('\n'));
    setImportNotice('已載入 24 位模擬班級名單，可直接體驗抽籤與分組功能');
  };

  const handleDeduplicateClick = () => {
    const removedCount = duplicateExtraCount;
    if (removedCount === 0) return;

    const seen = new Set<string>();
    const uniqueNames: string[] = [];
    students.forEach((s) => {
      const key = s.name.trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueNames.push(s.name);
      }
    });

    onRemoveDuplicates();
    if (pasteText.trim()) {
      setPasteText(uniqueNames.join('\n'));
    }
    setErrorMsg(null);
    setImportNotice(`已移除 ${removedCount} 筆重複姓名，目前保留 ${uniqueNames.length} 位學生`);
  };

  return (
    <aside
      id="roster-panel"
      aria-label="學生名單管理"
      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-5"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">名單來源</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            共 {students.length} 位學生
            <span aria-hidden="true" className="mx-1.5">·</span>
            出席 {presentCount} 位
          </p>
        </div>
        <button
          type="button"
          onClick={handleAppendSample}
          className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          載入模擬名單
        </button>
      </div>

      {/* CSV Upload Dropzone */}
      <div
        ref={dropZoneRef}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border border-dashed p-4 text-center transition-colors ${
          isDragging
            ? 'border-sky-500 bg-sky-50'
            : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={handleFileChange}
          className="hidden"
          aria-label="上傳 CSV 或 TXT 學生名單"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-600">
            拖曳 CSV / TXT 檔案至此，或
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            選擇檔案上傳
          </button>
        </div>
      </div>

      {/* Multi-column CSV Selector */}
      {csvTable && csvTable.headers.length > 1 && (
        <div className="space-y-1.5">
          <label
            htmlFor="csv-column-select"
            className="block text-xs font-medium text-slate-700"
          >
            偵測到多個欄位（{csvTable.fileName}），請選擇姓名欄位：
          </label>
          <select
            id="csv-column-select"
            value={selectedCol}
            onChange={(e) => handleColumnChange(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
          >
            {csvTable.headers.map((header, idx) => (
              <option key={`${header}-${idx}`} value={idx}>
                {header}（範例：{csvTable.rows[0]?.[idx] || '無'}）
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Paste Text Input */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="paste-roster-textarea"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-slate-500" />
            貼上學生姓名
          </label>
          {detectedPasteCount > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">
              已輸入 {detectedPasteCount} 筆
            </span>
          )}
        </div>
        <textarea
          ref={pasteInputRef}
          id="paste-roster-textarea"
          rows={4}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="每行一位學生姓名，或以逗號、頓號分隔&#10;例如：&#10;陳冠宇&#10;林雅婷&#10;張哲瑋"
          className="w-full px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600 resize-y"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setPasteText('');
              setErrorMsg(null);
            }}
            disabled={!pasteText}
            className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            清除輸入框
          </button>
          <button
            type="button"
            onClick={handleApplyPaste}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            套用貼上名單
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div
          role="alert"
          className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
        >
          {errorMsg}
        </div>
      )}
      {importNotice && !errorMsg && (
        <div className="px-3 py-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          {importNotice}
        </div>
      )}

      {/* Active Student Roster List */}
      <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            目前名單預覽
          </span>
          <div className="flex items-center gap-2">
            {presentCount < students.length && (
              <button
                type="button"
                onClick={onSetAllPresent}
                className="text-xs font-medium text-sky-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                全部設為出席
              </button>
            )}
            {students.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClearStudents();
                  setImportNotice(null);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                清空名單
              </button>
            )}
          </div>
        </div>

        {/* Duplicate Name Detection Banner */}
        {duplicateExtraCount > 0 && (
          <div
            role="alert"
            className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2 min-w-0 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-medium tabular-nums">
                發現 {duplicateExtraCount} 筆重複姓名
              </span>
            </div>
            <button
              type="button"
              onClick={handleDeduplicateClick}
              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              一鍵移除重複
            </button>
          </div>
        )}

        {students.length === 0 ? (
          <div className="py-8 px-4 text-center space-y-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">
              尚未匯入學生名單，請上傳 CSV、貼上姓名，或載入模擬名單快速體驗。
            </p>
            <button
              type="button"
              onClick={handleAppendSample}
              className="px-3.5 py-2 text-xs font-semibold text-sky-700 bg-white border border-sky-200 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
            >
              載入 24 人模擬名單
            </button>
          </div>
        ) : (
          <ul className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 pr-1">
            {students.map((student) => {
              const isDrawn = drawnStudentIds.has(student.id);
              const dupCount = nameCounts.get(student.name.trim()) ?? 0;
              const isDuplicate = dupCount > 1;
              return (
                <li
                  key={student.id}
                  className={`py-2 flex items-center justify-between gap-2 group ${
                    isDuplicate ? 'bg-amber-50/70 px-2 rounded-md' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono tabular-nums text-xs text-slate-400 w-6 shrink-0">
                      {String(student.seatNumber).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-sm truncate ${
                        student.present
                          ? 'text-slate-900 font-medium'
                          : 'text-slate-400 line-through'
                      }`}
                    >
                      {student.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDuplicate && (
                      <span
                        title={`此姓名在名單中共出現 ${dupCount} 次`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 mr-1"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        重複
                      </span>
                    )}
                    {isDrawn && (
                      <span className="text-xs text-sky-700 font-medium mr-1">
                        已抽過
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onTogglePresent(student.id)}
                      title={student.present ? '點擊標記為請假（不參與抽籤與分組）' : '點擊恢復為出席'}
                      className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                        student.present
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                      }`}
                      aria-label={
                        student.present
                          ? `將 ${student.name} 設為請假`
                          : `將 ${student.name} 設為出席`
                      }
                    >
                      {student.present ? (
                        <UserCheck className="w-3.5 h-3.5" />
                      ) : (
                        <UserX className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveStudent(student.id)}
                      title="從名單移除"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                      aria-label={`移除 ${student.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};
