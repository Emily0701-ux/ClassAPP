import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, UsersRound } from 'lucide-react';
import { Header } from './components/Header';
import { RosterPanel } from './components/RosterPanel';
import { RandomPickerStage } from './components/RandomPickerStage';
import {
  GroupGeneratorStage,
  buildRandomGroups,
} from './components/GroupGeneratorStage';
import type {
  DrawMode,
  DrawRecord,
  RemainderMode,
  SoundPreset,
  Student,
  StudentGroup,
  WorkspaceTab,
} from './types/classroom';
import {
  SAMPLE_STUDENT_NAMES,
  buildStudentsFromNames,
} from './utils/csvParser';

const STORAGE_KEY_STUDENTS = 'classroom_assistant_students_v1';
const STORAGE_KEY_SETTINGS = 'classroom_assistant_settings_v1';

interface SavedSettings {
  drawMode: DrawMode;
  soundEnabled: boolean;
  soundPreset: SoundPreset;
  groupSize: number;
  remainderMode: RemainderMode;
}

const DEFAULT_SETTINGS: SavedSettings = {
  drawMode: 'no-repeat',
  soundEnabled: true,
  soundPreset: 'wheel',
  groupSize: 4,
  remainderMode: 'distribute',
};

function loadInitialStudents(): Student[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STUDENTS);
    if (raw) {
      const parsed = JSON.parse(raw) as Student[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Fallback to sample list
  }
  return buildStudentsFromNames(SAMPLE_STUDENT_NAMES);
}

function loadInitialSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SavedSettings>) };
    }
  } catch {
    // Fallback to defaults
  }
  return DEFAULT_SETTINGS;
}

export default function App() {
  const initialSettings = useMemo(() => loadInitialSettings(), []);

  const [students, setStudents] = useState<Student[]>(() => loadInitialStudents());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('picker');

  // Feature 1: Random Picker State
  const [drawMode, setDrawMode] = useState<DrawMode>(initialSettings.drawMode);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    initialSettings.soundEnabled
  );
  const [soundPreset, setSoundPreset] = useState<SoundPreset>(
    initialSettings.soundPreset
  );
  const [drawnHistory, setDrawnHistory] = useState<DrawRecord[]>([]);

  // Feature 2: Auto Grouping State
  const [groupSize, setGroupSize] = useState<number>(initialSettings.groupSize);
  const [remainderMode, setRemainderMode] = useState<RemainderMode>(
    initialSettings.remainderMode
  );
  const [groups, setGroups] = useState<StudentGroup[]>(() =>
    buildRandomGroups(
      loadInitialStudents().filter((s) => s.present),
      initialSettings.groupSize,
      initialSettings.remainderMode
    )
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Persist students and settings locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
    } catch {
      // Ignore storage quota errors
    }
  }, [students]);

  useEffect(() => {
    try {
      const nextSettings: SavedSettings = {
        drawMode,
        soundEnabled,
        soundPreset,
        groupSize,
        remainderMode,
      };
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(nextSettings));
    } catch {
      // Ignore storage quota errors
    }
  }, [drawMode, soundEnabled, soundPreset, groupSize, remainderMode]);

  const drawnStudentIds = useMemo(
    () => new Set(drawnHistory.map((rec) => rec.studentId)),
    [drawnHistory]
  );

  const handleUpdateStudents = useCallback(
    (names: string[]) => {
      const nextStudents = buildStudentsFromNames(names);
      setStudents(nextStudents);
      setDrawnHistory([]);
      setGroups(
        buildRandomGroups(
          nextStudents.filter((s) => s.present),
          groupSize,
          remainderMode
        )
      );
    },
    [groupSize, remainderMode]
  );

  const handleLoadSample = useCallback(() => {
    handleUpdateStudents(SAMPLE_STUDENT_NAMES);
  }, [handleUpdateStudents]);

  const handleTogglePresent = useCallback((studentId: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, present: !s.present } : s))
    );
  }, []);

  const handleRemoveStudent = useCallback((studentId: string) => {
    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== studentId);
      return filtered.map((s, idx) => ({ ...s, seatNumber: idx + 1 }));
    });
    setDrawnHistory((prev) =>
      prev
        .filter((rec) => rec.studentId !== studentId)
        .map((rec, idx) => ({ ...rec, order: idx + 1 }))
    );
    setGroups((prev) =>
      prev
        .map((grp) => ({
          ...grp,
          members: grp.members.filter((m) => m.id !== studentId),
        }))
        .filter((grp) => grp.members.length > 0)
        .map((grp, idx) => ({ ...grp, index: idx + 1 }))
    );
  }, []);

  const handleSetAllPresent = useCallback(() => {
    setStudents((prev) => prev.map((s) => ({ ...s, present: true })));
  }, []);

  const handleClearStudents = useCallback(() => {
    setStudents([]);
    setDrawnHistory([]);
    setGroups([]);
  }, []);

  const handleRemoveDuplicates = useCallback(() => {
    const seen = new Set<string>();
    const kept: Student[] = [];
    const removedIds = new Set<string>();

    students.forEach((student) => {
      const key = student.name.trim();
      if (seen.has(key)) {
        removedIds.add(student.id);
      } else {
        seen.add(key);
        kept.push({ ...student, seatNumber: kept.length + 1 });
      }
    });

    if (removedIds.size === 0) return;

    setStudents(kept);
    setDrawnHistory((prev) =>
      prev
        .filter((rec) => !removedIds.has(rec.studentId))
        .map((rec, idx) => ({ ...rec, order: idx + 1 }))
    );
    setGroups((prev) =>
      prev
        .map((grp) => ({
          ...grp,
          members: grp.members.filter((m) => !removedIds.has(m.id)),
        }))
        .filter((grp) => grp.members.length > 0)
        .map((grp, idx) => ({ ...grp, index: idx + 1 }))
    );
  }, [students]);

  const handleRecordDraw = useCallback((student: Student) => {
    setDrawnHistory((prev) => [
      ...prev,
      {
        id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: student.id,
        studentName: student.name,
        seatNumber: student.seatNumber,
        order: prev.length + 1,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const handleResetHistory = useCallback(() => {
    setDrawnHistory([]);
  }, []);

  const handleFocusRoster = () => {
    const el = document.getElementById('roster-panel');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      pasteInputRef.current?.focus();
    }, 250);
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onFocusRoster={handleFocusRoster}
        onLoadSample={handleLoadSample}
        onTriggerCsvUpload={() => fileInputRef.current?.click()}
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-8">
          {/* Left Column: Roster Input & Management */}
          <div className="w-full lg:w-[360px] shrink-0">
            <RosterPanel
              students={students}
              drawnStudentIds={drawnStudentIds}
              fileInputRef={fileInputRef}
              pasteInputRef={pasteInputRef}
              onUpdateStudents={handleUpdateStudents}
              onTogglePresent={handleTogglePresent}
              onRemoveStudent={handleRemoveStudent}
              onSetAllPresent={handleSetAllPresent}
              onClearStudents={handleClearStudents}
              onLoadSample={handleLoadSample}
              onRemoveDuplicates={handleRemoveDuplicates}
            />
          </div>

          {/* Right Column: Main Classroom Stage */}
          <div className="flex-1 w-full min-w-0 flex flex-col gap-6">
            {/* Workspace Heading & Feature Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {activeTab === 'picker' ? '課堂隨機抽籤' : '課堂自動分組'}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  {activeTab === 'picker'
                    ? '支援不重複或可重複抽取，搭配動畫與即時音效提示。'
                    : '自訂每組人數快速洗牌分組，並提供視覺化組別與手動對調。'}
                </p>
              </div>

              {/* Workspace Feature Switcher */}
              <div
                role="tablist"
                aria-label="功能切換"
                className="inline-flex items-center p-1 bg-slate-200/75 rounded-xl self-start sm:self-auto"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'picker'}
                  onClick={() => setActiveTab('picker')}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'picker'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Dices className="w-4 h-4 text-sky-700" />
                  隨機抽籤
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'grouping'}
                  onClick={() => setActiveTab('grouping')}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'grouping'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UsersRound className="w-4 h-4 text-sky-700" />
                  自動分組
                </button>
              </div>
            </div>

            {/* Active Feature Stage */}
            {activeTab === 'picker' ? (
              <RandomPickerStage
                students={students}
                drawMode={drawMode}
                onChangeDrawMode={setDrawMode}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled((prev) => !prev)}
                soundPreset={soundPreset}
                onChangeSoundPreset={setSoundPreset}
                drawnHistory={drawnHistory}
                drawnStudentIds={drawnStudentIds}
                onRecordDraw={handleRecordDraw}
                onResetHistory={handleResetHistory}
              />
            ) : (
              <GroupGeneratorStage
                students={students}
                groupSize={groupSize}
                onChangeGroupSize={setGroupSize}
                remainderMode={remainderMode}
                onChangeRemainderMode={setRemainderMode}
                groups={groups}
                onUpdateGroups={setGroups}
                soundEnabled={soundEnabled}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 lg:px-8 mt-8">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>課堂點名與分組工具 — 所有名單資料皆於瀏覽器本機處理與暫存，不上傳外部伺服器。</span>
          <span>支援 UTF-8 / Big5 CSV 匯入與空白鍵快速抽籤</span>
        </div>
      </footer>
    </div>
  );
}
