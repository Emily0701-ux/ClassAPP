import React from 'react';
import type { WorkspaceTab } from '../types/classroom';

interface HeaderProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onFocusRoster: () => void;
  onLoadSample: () => void;
  onTriggerCsvUpload: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onFocusRoster,
  onLoadSample,
  onTriggerCsvUpload,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Title (single text element) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          課堂點名與分組
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="主導覽"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={onFocusRoster}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            名單管理
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('picker')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer underline-offset-4 ${
              activeTab === 'picker'
                ? 'text-sky-700 font-semibold underline'
                : 'hover:text-slate-900 hover:underline'
            }`}
          >
            隨機抽籤
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('grouping')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer underline-offset-4 ${
              activeTab === 'grouping'
                ? 'text-sky-700 font-semibold underline'
                : 'hover:text-slate-900 hover:underline'
            }`}
          >
            自動分組
          </button>
          <button
            type="button"
            onClick={onLoadSample}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            模擬名單
          </button>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onTriggerCsvUpload}
            className="px-4 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            匯入 CSV 名單
          </button>
        </div>
      </div>
    </header>
  );
};
