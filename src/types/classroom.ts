export interface Student {
  id: string;
  seatNumber: number;
  name: string;
  present: boolean;
}

export type WorkspaceTab = 'picker' | 'grouping';

export type DrawMode = 'no-repeat' | 'allow-repeat';

export type SoundPreset = 'wheel' | 'chime' | 'marimba';

export interface DrawRecord {
  id: string;
  studentId: string;
  studentName: string;
  seatNumber: number;
  order: number;
  timestamp: number;
}

export type RemainderMode = 'distribute' | 'separate';

export type GroupViewMode = 'cards' | 'tables';

export interface StudentGroup {
  id: string;
  index: number;
  members: Student[];
}

export interface CsvTableData {
  headers: string[];
  rows: string[][];
  suggestedColumnIndex: number;
  fileName: string;
}
