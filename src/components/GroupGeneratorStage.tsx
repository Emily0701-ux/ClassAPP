import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Shuffle,
  Download,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  LayoutGrid,
  CircleDot,
  Square,
  Triangle,
  Diamond,
  Hexagon,
  Star,
  ArrowLeftRight,
} from 'lucide-react';
import type {
  GroupViewMode,
  RemainderMode,
  Student,
  StudentGroup,
} from '../types/classroom';
import { exportGroupsToCsv, formatGroupsAsText } from '../utils/csvParser';
import { soundEngine } from '../utils/soundEngine';

interface GroupGeneratorStageProps {
  students: Student[];
  groupSize: number;
  onChangeGroupSize: (size: number) => void;
  remainderMode: RemainderMode;
  onChangeRemainderMode: (mode: RemainderMode) => void;
  groups: StudentGroup[];
  onUpdateGroups: (groups: StudentGroup[]) => void;
  soundEnabled: boolean;
}

const GROUP_STYLES = [
  {
    topBar: 'bg-sky-600',
    accentText: 'text-sky-700',
    softBg: 'bg-sky-50',
    ringBorder: 'border-sky-300',
    Icon: CircleDot,
  },
  {
    topBar: 'bg-emerald-600',
    accentText: 'text-emerald-700',
    softBg: 'bg-emerald-50',
    ringBorder: 'border-emerald-300',
    Icon: Square,
  },
  {
    topBar: 'bg-amber-600',
    accentText: 'text-amber-700',
    softBg: 'bg-amber-50',
    ringBorder: 'border-amber-300',
    Icon: Triangle,
  },
  {
    topBar: 'bg-indigo-600',
    accentText: 'text-indigo-700',
    softBg: 'bg-indigo-50',
    ringBorder: 'border-indigo-300',
    Icon: Diamond,
  },
  {
    topBar: 'bg-rose-600',
    accentText: 'text-rose-700',
    softBg: 'bg-rose-50',
    ringBorder: 'border-rose-300',
    Icon: Hexagon,
  },
  {
    topBar: 'bg-teal-600',
    accentText: 'text-teal-700',
    softBg: 'bg-teal-50',
    ringBorder: 'border-teal-300',
    Icon: Star,
  },
];

function fisherYatesShuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    let j = 0;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildRandomGroups(
  presentStudents: Student[],
  groupSize: number,
  remainderMode: RemainderMode
): StudentGroup[] {
  if (presentStudents.length === 0) return [];
  const safeSize = Math.max(1, Math.min(groupSize, presentStudents.length));
  const shuffled = fisherYatesShuffle(presentStudents);

  if (remainderMode === 'separate' || safeSize === 1) {
    const groups: StudentGroup[] = [];
    for (let i = 0; i < shuffled.length; i += safeSize) {
      groups.push({
        id: `grp-${groups.length + 1}-${Date.now()}`,
        index: groups.length + 1,
        members: shuffled.slice(i, i + safeSize),
      });
    }
    return groups;
  }

  // Distribute remainder evenly: compute ideal group count closest to target size
  const total = shuffled.length;
  const groupCount = Math.max(1, Math.floor(total / safeSize));
  const groups: StudentGroup[] = Array.from({ length: groupCount }, (_, i) => ({
    id: `grp-${i + 1}-${Date.now()}`,
    index: i + 1,
    members: [],
  }));

  shuffled.forEach((student, idx) => {
    groups[idx % groupCount].members.push(student);
  });

  return groups;
}

export const GroupGeneratorStage: React.FC<GroupGeneratorStageProps> = ({
  students,
  groupSize,
  onChangeGroupSize,
  remainderMode,
  onChangeRemainderMode,
  groups,
  onUpdateGroups,
  soundEnabled,
}) => {
  const [viewMode, setViewMode] = useState<GroupViewMode>('cards');
  const [generationKey, setGenerationKey] = useState(0);
  const [swapSelection, setSwapSelection] = useState<{
    groupId: string;
    studentId: string;
    studentName: string;
  } | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const presentStudents = useMemo(
    () => students.filter((s) => s.present),
    [students]
  );

  const estimatedGroupCount = useMemo(() => {
    if (presentStudents.length === 0) return 0;
    const safeSize = Math.max(1, Math.min(groupSize, presentStudents.length));
    if (remainderMode === 'separate') {
      return Math.ceil(presentStudents.length / safeSize);
    }
    return Math.max(1, Math.floor(presentStudents.length / safeSize));
  }, [presentStudents.length, groupSize, remainderMode]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const handleGenerate = () => {
    if (presentStudents.length === 0) return;
    soundEngine.unlock();
    const nextGroups = buildRandomGroups(presentStudents, groupSize, remainderMode);
    onUpdateGroups(nextGroups);
    setSwapSelection(null);
    setGenerationKey((k) => k + 1);
    if (soundEnabled) {
      soundEngine.playGroupShuffle();
    }
  };

  const handleMemberClick = (groupId: string, student: Student) => {
    if (!swapSelection) {
      setSwapSelection({
        groupId,
        studentId: student.id,
        studentName: student.name,
      });
      return;
    }

    if (swapSelection.studentId === student.id) {
      setSwapSelection(null);
      return;
    }

    // Swap students between groups (or positions within same group)
    const nextGroups = groups.map((g) => ({
      ...g,
      members: [...g.members],
    }));

    const sourceGroup = nextGroups.find((g) => g.id === swapSelection.groupId);
    const targetGroup = nextGroups.find((g) => g.id === groupId);

    if (sourceGroup && targetGroup) {
      const srcIdx = sourceGroup.members.findIndex(
        (m) => m.id === swapSelection.studentId
      );
      const tgtIdx = targetGroup.members.findIndex((m) => m.id === student.id);
      if (srcIdx >= 0 && tgtIdx >= 0) {
        const temp = sourceGroup.members[srcIdx];
        sourceGroup.members[srcIdx] = targetGroup.members[tgtIdx];
        targetGroup.members[tgtIdx] = temp;
        onUpdateGroups(nextGroups);
      }
    }

    setSwapSelection(null);
  };

  const handleCopyText = async () => {
    if (groups.length === 0) return;
    try {
      await navigator.clipboard.writeText(formatGroupsAsText(groups));
      setCopiedText(true);
      window.setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleExportCsv = () => {
    if (groups.length === 0) return;
    const csvContent = exportGroupsToCsv(groups);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `課堂分組結果_${groups.length}組.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderGroupVisuals = (fullscreenLayout: boolean) => {
    if (viewMode === 'tables') {
      return (
        <div
          className={`grid gap-6 ${
            fullscreenLayout
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2'
          }`}
        >
          {groups.map((group, idx) => {
            const style = GROUP_STYLES[idx % GROUP_STYLES.length];
            const GroupIcon = style.Icon;
            const totalMembers = group.members.length;

            return (
              <motion.div
                key={`${generationKey}-${group.id}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.25,
                  delay: Math.min(idx * 0.04, 0.3),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center gap-4"
              >
                {/* Table Visualization Canvas */}
                <div className="relative w-full max-w-[320px] aspect-square flex items-center justify-center">
                  {/* Subtle circular orbit ring */}
                  <svg
                    viewBox="0 0 240 240"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="120"
                      cy="120"
                      r="82"
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  </svg>

                  {/* Center Table Hub */}
                  <div
                    className={`w-24 h-24 rounded-full ${style.softBg} border ${style.ringBorder} flex flex-col items-center justify-center text-center z-10 px-2`}
                  >
                    <GroupIcon
                      className={`w-4 h-4 ${style.accentText} mb-0.5`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-bold text-slate-900">
                      第 {group.index} 組
                    </span>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {totalMembers} 人
                    </span>
                  </div>

                  {/* Seated Members Around Table */}
                  {group.members.map((member, mIdx) => {
                    const angle =
                      (mIdx / Math.max(totalMembers, 1)) * 2 * Math.PI -
                      Math.PI / 2;
                    const radiusPct = 36;
                    const leftPct = 50 + radiusPct * Math.cos(angle);
                    const topPct = 50 + radiusPct * Math.sin(angle);
                    const isSelected = swapSelection?.studentId === member.id;

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => handleMemberClick(group.id, member)}
                        title="點擊選取並與其他組員對調"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute z-20 px-2.5 py-1.5 rounded-lg border text-center transition-transform cursor-pointer min-w-[74px] max-w-[110px] ${
                          isSelected
                            ? 'bg-sky-700 text-white border-sky-800 scale-105'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-sky-400 hover:bg-sky-50'
                        }`}
                      >
                        <div
                          className={`text-[10px] font-mono tabular-nums leading-none mb-0.5 ${
                            isSelected ? 'text-sky-100' : 'text-slate-400'
                          }`}
                        >
                          {String(member.seatNumber).padStart(2, '0')}
                        </div>
                        <div className="text-xs font-semibold truncate">
                          {member.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      );
    }

    // Default Cards Grid Visualization
    return (
      <div
        className={`grid gap-4 ${
          fullscreenLayout
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {groups.map((group, idx) => {
          const style = GROUP_STYLES[idx % GROUP_STYLES.length];
          const GroupIcon = style.Icon;

          return (
            <motion.div
              key={`${generationKey}-${group.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.22,
                delay: Math.min(idx * 0.035, 0.28),
                ease: [0.16, 1, 0.3, 1],
              }}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
            >
              {/* Subtle top bar (not left border) */}
              <div className={`h-1.5 w-full ${style.topBar}`} />

              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <GroupIcon
                      className={`w-4 h-4 ${style.accentText} shrink-0`}
                      aria-hidden="true"
                    />
                    <h3 className="text-base font-bold text-slate-900">
                      第 {group.index} 組
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {group.members.length} 人
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {group.members.map((member) => {
                    const isSelected = swapSelection?.studentId === member.id;
                    return (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={() => handleMemberClick(group.id, member)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-sky-700 text-white'
                              : 'bg-slate-50 hover:bg-sky-50 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`font-mono tabular-nums text-xs w-6 shrink-0 ${
                                isSelected ? 'text-sky-100' : 'text-slate-400'
                              }`}
                            >
                              {String(member.seatNumber).padStart(2, '0')}
                            </span>
                            <span className="text-sm font-semibold truncate">
                              {member.name}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-xs font-medium text-sky-100 shrink-0">
                              待交換
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <section aria-label="自動分組工具" className="flex flex-col gap-6">
      {/* Configuration Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Group Size Stepper + Presets */}
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="group-size-input"
              className="text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              每組人數
            </label>
            <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                aria-label="減少每組人數"
                onClick={() => onChangeGroupSize(Math.max(2, groupSize - 1))}
                className="p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                id="group-size-input"
                type="number"
                min={2}
                max={50}
                value={groupSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isNaN(val)) {
                    onChangeGroupSize(Math.max(2, Math.min(50, val)));
                  }
                }}
                className="w-12 text-center text-sm font-bold font-mono tabular-nums text-slate-900 focus:outline-none py-1.5"
              />
              <button
                type="button"
                aria-label="增加每組人數"
                onClick={() => onChangeGroupSize(Math.min(50, groupSize + 1))}
                className="p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1">
              {[2, 3, 4, 5, 6].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeGroupSize(preset)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors tabular-nums cursor-pointer ${
                    groupSize === preset
                      ? 'bg-sky-50 text-sky-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {preset}人
                </button>
              ))}
            </div>
          </div>

          {/* Remainder Mode */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              餘數分配
            </span>
            <div
              role="group"
              aria-label="餘數處理方式"
              className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                onClick={() => onChangeRemainderMode('distribute')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  remainderMode === 'distribute'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                平均併入各組
              </button>
              <button
                type="button"
                onClick={() => onChangeRemainderMode('separate')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  remainderMode === 'separate'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                獨立成最後一組
              </button>
            </div>
          </div>
        </div>

        {/* Summary & Primary Action Row */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-600 tabular-nums">
            <span>出席人數 {presentStudents.length} 位</span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span>每組 {groupSize} 人</span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span>
              預計分為{' '}
              <strong className="text-slate-900 font-bold">
                {estimatedGroupCount}
              </strong>{' '}
              組
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={presentStudents.length === 0}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-sky-700 hover:bg-sky-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-4 h-4" />
              {groups.length > 0 ? '重新隨機分組' : '開始自動分組'}
            </button>
          </div>
        </div>
      </div>

      {/* Results Toolbar + Visual Stage */}
      {presentStudents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
          <p className="text-base font-semibold text-slate-800">
            目前沒有可分組的出席學生
          </p>
          <p className="text-sm text-slate-500">
            請先於左側匯入 CSV 或貼上學生姓名後，再執行自動分組。
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4">
          <p className="text-base font-semibold text-slate-800">
            設定每組人數後，點擊「開始自動分組」即可產生視覺化組別
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-xl transition-colors cursor-pointer"
          >
            <Shuffle className="w-4 h-4" />
            立即產生 {estimatedGroupCount} 組分組
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Visualization & Export Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* View Mode Switcher */}
              <div
                role="group"
                aria-label="分組視覺化檢視模式"
                className="inline-flex items-center p-1 bg-slate-200/70 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  卡片檢視
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('tables')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'tables'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  桌次視覺圖
                </button>
              </div>

              {/* Manual Swap Status Hint */}
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {swapSelection ? (
                  <span className="text-sky-700 font-medium">
                    已選取「{swapSelection.studentName}」，請點擊另一位學生進行對調
                    <button
                      type="button"
                      onClick={() => setSwapSelection(null)}
                      className="ml-2 underline text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      取消
                    </button>
                  </span>
                ) : (
                  <span>點擊任兩位學生可手動對調組別</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedText ? (
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedText ? '已複製文字' : '複製分組'}
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                下載 CSV 檔案
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                投影全螢幕
              </button>
            </div>
          </div>

          {renderGroupVisuals(false)}
        </div>
      )}

      {/* Fullscreen Projector Modal */}
      {isFullscreen && groups.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="分組結果全螢幕投影"
          className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto p-6 sm:p-8 flex flex-col gap-6"
        >
          <div className="max-w-[1400px] w-full mx-auto flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                課堂分組名單
              </h2>
              <p className="text-sm text-slate-500 tabular-nums mt-0.5">
                共 {groups.length} 組 · {presentStudents.length} 位學生
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                下載 CSV
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors cursor-pointer"
              >
                <Shuffle className="w-4 h-4" />
                重新洗牌
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
                結束投影 (Esc)
              </button>
            </div>
          </div>
          <div className="max-w-[1400px] w-full mx-auto">
            {renderGroupVisuals(true)}
          </div>
        </div>
      )}
    </section>
  );
};
