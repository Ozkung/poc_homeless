import { create } from 'zustand';
import type { SystemProfile } from '../lib/api';

export type { SystemProfile };

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

interface ProfileStore {
  lineProfile: LineProfile | null;
  systemProfile: SystemProfile | null;
  setLineProfile: (p: LineProfile) => void;
  setSystemProfile: (p: SystemProfile) => void;
  updateSystemProfile: (partial: Partial<SystemProfile>) => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  lineProfile: null,
  systemProfile: null,
  setLineProfile: (p) => set({ lineProfile: p }),
  setSystemProfile: (p) => set({ systemProfile: p }),
  updateSystemProfile: (partial) =>
    set((state) => ({
      systemProfile: state.systemProfile ? { ...state.systemProfile, ...partial } : null,
    })),
}));
