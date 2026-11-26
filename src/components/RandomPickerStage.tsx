import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Check,
  Copy,
  Trash2,
  Award,
} from 'lucide-react';
import type { DrawMode, DrawRecord, SoundPreset, Student } from '../types/classroom';
import { soundEngine } from '../utils/soundEngine';

interface RandomPickerStageProps {
  students: Student[];
  drawMode: DrawMode;
  onChangeDrawMode: (mode: DrawMode) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  soundPreset: SoundPreset;
  onChangeSoundPreset: (preset: SoundPreset) => void;
  drawnHistory: DrawRecord[];
  drawnStudentIds: Set<string>;
  onRecordDraw: (student: Student) => void;
  onResetHistory: () => void;
}

function secureRandomIndex(length: number): number {
  if (length <= 1) return 0;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % length;
  }
  return Math.floor(Math.random() * length);
}

const CELEBRATION_RAYS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export const RandomPickerStage: React.FC<RandomPickerStageProps> = ({
  students,
  drawMode,
  onChangeDrawMode,
  soundEnabled,
  onToggleSound,
  soundPreset,
  onChangeSoundPreset,
  drawnHistory,
  drawnStudentIds,
  onRecordDraw,
  onResetHistory,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [spotlightStudent, setSpotlightStudent] = useState<Student | null>(null);
  const [neighborNames, setNeighborNames] = useState<{ prev: string; next: string }>({
    prev: '',
    next: '',
  });
  const [justWonKey, setJustWonKey] = useState<number>(0);
  const [copiedHistory, setCopiedHistory] = useState(false);

  const timerRef = useRef<number | null>(null);

  const presentStudents = useMemo(
    () => students.filter((s) => s.present),
    [students]
  );

  const eligibleStudents = useMemo(() => {
    if (drawMode === 'allow-repeat') {
      return presentStudents;
    }
    return presentStudents.filter((s) => !drawnStudentIds.has(s.id));
  }, [presentStudents, drawMode, drawnStudentIds]);

  const clearSpinTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearSpinTimer();
  }, []);

  // Keep spotlight synced if student list changes while idle
  useEffect(() => {
    if (!isSpinning && spotlightStudent) {
      const stillExists = students.some((s) => s.id === spotlightStudent.id);
      if (!stillExists) {
        setSpotlightStudent(null);
      }
    }
  }, [students, isSpinning, spotlightStudent]);

  const handleDraw = useCallback(() => {
    if (isSpinning || eligibleStudents.length === 0) return;

    soundEngine.unlock();

    const winner = eligibleStudents[secureRandomIndex(eligibleStudents.length)];
    const poolForVisual =
      presentStudents.length > 1 ? presentStudents : eligibleStudents;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || poolForVisual.length === 1) {
      setSpotlightStudent(winner);
      setJustWonKey((k) => k + 1);
      onRecordDraw(winner);
      if (soundEnabled) {
        soundEngine.playWinner(soundPreset);
      }
      return;
    }

    setIsSpinning(true);

    const totalSteps = 26;
    let step = 0;
    let lastVisualIndex = -1;

    const runStep = () => {
      step += 1;
      const progress = step / totalSteps;

      if (step < totalSteps) {
        // Pick a random visual student different from the immediately preceding frame
        let visualIdx = secureRandomIndex(poolForVisual.length);
        if (poolForVisual.length > 1 && visualIdx === lastVisualIndex) {
          visualIdx = (visualIdx + 1) % poolForVisual.length;
        }
        lastVisualIndex = visualIdx;

        const current = poolForVisual[visualIdx];
        const prev =
          poolForVisual[(visualIdx - 1 + poolForVisual.length) % poolForVisual.length];
        const next = poolForVisual[(visualIdx + 1) % poolForVisual.length];

        setSpotlightStudent(current);
        setNeighborNames({ prev: prev.name, next: next.name });

        if (soundEnabled) {
          soundEngine.playTick(progress, soundPreset);
        }

        // Smooth cubic ease-out deceleration: ~45ms up to ~330ms
        const delay = Math.round(45 + Math.pow(progress, 2.5) * 290);
        timerRef.current = window.setTimeout(runStep, delay);
      } else {
        // Final lock-in on the chosen winner
        const winnerIdx = poolForVisual.findIndex((s) => s.id === winner.id);
        const safeIdx = winnerIdx >= 0 ? winnerIdx : 0;
        const prev =
          poolForVisual[(safeIdx - 1 + poolForVisual.length) % poolForVisual.length];
        const next = poolForVisual[(safeIdx + 1) % poolForVisual.length];

        setSpotlightStudent(winner);
        setNeighborNames({ prev: prev.name, next: next.name });
        setIsSpinning(false);
        setJustWonKey((k) => k + 1);
        onRecordDraw(winner);

        if (soundEnabled) {
          soundEngine.playWinner(soundPreset);
        }
      }
    };

    runStep();
  }, [
    isSpinning,
    eligibleStudents,
    presentStudents,
    soundEnabled,
    soundPreset,
    onRecordDraw,
  ]);

  // Spacebar shortcut for fast classroom calling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!isSpinning && eligibleStudents.length > 0) {
        e.preventDefault();
        handleDraw();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDraw, isSpinning, eligibleStudents.length]);

  const handleCopyHistory = async () => {
    if (drawnHistory.length === 0) return;
    const text = drawnHistory
      .map(
        (rec) =>
          `${rec.order}. ${String(rec.seatNumber).padStart(2, '0')} ${rec.studentName}`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHistory(true);
      window.setTimeout(() => setCopiedHistory(false), 2000);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const allDrawnInNoRepeat =
    drawMode === 'no-repeat' &&
    presentStudents.length > 0 &&
    eligibleStudents.length === 0;

  return (
    <section aria-label="隨機抽籤舞台" className="flex flex-col gap-6">
      {/* Control Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        {/* Repeat Mode Segmented Control */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
            抽取規則
          </span>
          <div
            role="group"
            aria-label="抽取是否重複設定"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              disabled={isSpinning}
              onClick={() => onChangeDrawMode('no-repeat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                drawMode === 'no-repeat'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              不重複抽取
            </button>
            <button
              type="button"
              disabled={isSpinning}
              onClick={() => onChangeDrawMode('allow-repeat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                drawMode === 'allow-repeat'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              可重複抽取
            </button>
          </div>
        </div>

        {/* Sound Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleSound}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              soundEnabled
                ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-sky-700" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            {soundEnabled ? '音效開啟' : '音效靜音'}
          </button>

          {soundEnabled && (
            <>
              <select
                aria-label="選擇抽籤音效風格"
                value={soundPreset}
                onChange={(e) => onChangeSoundPreset(e.target.value as SoundPreset)}
                className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-600 cursor-pointer"
              >
                <option value="wheel">音效：遊戲轉盤</option>
                <option value="chime">音效：教室鐘聲</option>
                <option value="marimba">音效：清脆木琴</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.playWinner(soundPreset);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                試聽音效
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Draw Spotlight Stage */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10 flex flex-col items-center justify-between gap-8 min-h-[420px] relative overflow-hidden">
        {/* Top Metadata Readout (Zero-Pill Clean Text) */}
        <div className="w-full flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 tabular-nums">
            <span>
              模式：
              <strong className="font-semibold text-slate-900">
                {drawMode === 'no-repeat' ? '不重複抽取' : '可重複抽取'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              待抽名單：
              <strong className="font-semibold text-sky-700">
                {eligibleStudents.length}
              </strong>{' '}
              / {presentStudents.length} 位
            </span>
            <span aria-hidden="true">·</span>
            <span>已抽出 {drawnHistory.length} 次</span>
          </div>

          {drawnHistory.length > 0 && (
            <button
              type="button"
              disabled={isSpinning}
              onClick={() => {
                onResetHistory();
                setSpotlightStudent(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置抽籤進度
            </button>
          )}
        </div>

        {/* Center Reel / Result Display */}
        <div className="w-full max-w-xl flex flex-col items-center justify-center py-6 relative">
          {presentStudents.length === 0 ? (
            <div className="text-center space-y-2 py-8">
              <p className="text-lg font-semibold text-slate-800">
                目前沒有可參與抽籤的出席學生
              </p>
              <p className="text-sm text-slate-500">
                請先於左側「名單來源」上傳 CSV、貼上學生姓名，或將請假學生恢復為出席。
              </p>
            </div>
          ) : allDrawnInNoRepeat && !isSpinning ? (
            <div className="text-center space-y-5 py-4">
              {spotlightStudent && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-slate-500 mb-1">
                    最後一位抽出
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {spotlightStudent.name}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-lg font-bold text-emerald-700">
                  全班 {presentStudents.length} 位出席學生皆已抽完
                </p>
                <p className="text-sm text-slate-500">
                  點擊下方按鈕重置進度，即可開始新一輪不重複抽籤。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResetHistory();
                  setSpotlightStudent(null);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                重置名單開始新一輪
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-4 relative">
              {/* Celebratory radial burst when winner locks in */}
              {!isSpinning && justWonKey > 0 && spotlightStudent && (
                <div
                  key={`burst-${justWonKey}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  {CELEBRATION_RAYS.map((deg) => (
                    <motion.span
                      key={deg}
                      initial={{ opacity: 0.9, scale: 0.4, rotate: deg }}
                      animate={{ opacity: 0, scale: 1.45, rotate: deg }}
                      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute w-1 h-28 origin-bottom rounded-full bg-sky-400/50"
                      style={{ bottom: '50%' }}
                    />
                  ))}
                </div>
              )}

              {/* Top Neighbor Name in Reel */}
              <div className="h-7 flex items-center justify-center overflow-hidden">
                <span
                  className={`text-base font-medium transition-opacity duration-150 ${
                    isSpinning && neighborNames.prev
                      ? 'text-slate-300 opacity-100'
                      : 'opacity-0'
                  }`}
                >
                  {neighborNames.prev || '—'}
                </span>
              </div>

              {/* Active Center Name Box */}
              <div
                className={`w-full rounded-2xl border px-6 py-10 text-center transition-colors duration-200 ${
                  isSpinning
                    ? 'bg-sky-50/70 border-sky-300'
                    : spotlightStudent
                      ? 'bg-slate-50 border-sky-600'
                      : 'bg-slate-50 border-slate-200'
                }`}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {spotlightStudent ? (
                    <motion.div
                      key={
                        isSpinning
                          ? `spin-${spotlightStudent.id}-${spotlightStudent.name}`
                          : `win-${justWonKey}-${spotlightStudent.id}`
                      }
                      initial={
                        isSpinning
                          ? { opacity: 0.55, y: 12, scale: 0.97 }
                          : { opacity: 0, scale: 0.9 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={isSpinning ? { opacity: 0.3, y: -12 } : { opacity: 0 }}
                      transition={{
                        duration: isSpinning ? 0.06 : 0.28,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="flex items-center gap-2 text-sm font-mono tabular-nums text-slate-500">
                        {!isSpinning && (
                          <Award className="w-4 h-4 text-sky-700" aria-hidden="true" />
                        )}
                        <span>
                          座號 {String(spotlightStudent.seatNumber).padStart(2, '0')}
                        </span>
                        {!isSpinning && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans font-semibold text-sky-700">
                              中選學生
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-5xl sm:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
                        {spotlightStudent.name}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle-prompt"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-2 py-2"
                    >
                      <span className="text-sm font-medium text-slate-500">
                        準備就緒
                      </span>
                      <span className="text-2xl sm:text-3xl font-bold text-slate-400">
                        點擊下方按鈕開始隨機抽籤
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Neighbor Name in Reel */}
              <div className="h-7 flex items-center justify-center overflow-hidden">
                <span
                  className={`text-base font-medium transition-opacity duration-150 ${
                    isSpinning && neighborNames.next
                      ? 'text-slate-300 opacity-100'
                      : 'opacity-0'
                  }`}
                >
                  {neighborNames.next || '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Primary CTA Footer */}
        {presentStudents.length > 0 && !allDrawnInNoRepeat && (
          <div className="flex flex-col items-center gap-2.5">
            <button
              type="button"
              disabled={isSpinning || eligibleStudents.length === 0}
              onClick={handleDraw}
              className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 min-w-[210px] text-base font-bold text-white bg-sky-700 hover:bg-sky-800 active:scale-[0.99] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              <Play className="w-5 h-5 fill-current" />
              {isSpinning
                ? '正在隨機抽選...'
                : spotlightStudent
                  ? '再抽下一位'
                  : '開始隨機抽籤'}
            </button>
            <span className="text-xs text-slate-400">
              快捷鍵：按空白鍵（Space）可直接抽籤
            </span>
          </div>
        )}
      </div>

      {/* Draw History Log */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">抽籤順序紀錄</h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              已記錄 {drawnHistory.length} 筆結果
            </p>
          </div>
          {drawnHistory.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedHistory ? (
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedHistory ? '已複製名單' : '複製紀錄'}
              </button>
              <button
                type="button"
                disabled={isSpinning}
                onClick={() => {
                  onResetHistory();
                  setSpotlightStudent(null);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空紀錄
              </button>
            </div>
          )}
        </div>

        {drawnHistory.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">
            尚未抽出學生，開始抽籤後會依序記錄在此處。
          </p>
        ) : (
          <ol className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {drawnHistory.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg"
              >
                <span className="font-mono tabular-nums text-xs font-semibold text-sky-700 w-6 shrink-0">
                  #{rec.order}
                </span>
                <span className="text-sm font-medium text-slate-900 truncate">
                  {rec.studentName}
                </span>
                <span className="font-mono tabular-nums text-xs text-slate-400 ml-auto shrink-0">
                  {String(rec.seatNumber).padStart(2, '0')}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
