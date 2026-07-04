import { create } from 'zustand';
import type { Zone, SystemProfile } from '../lib/api';

export type { SystemProfile, Zone };

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

interface ProfileStore {
  lineProfile: LineProfile | null;
  systemProfile: SystemProfile | null;
  zones: Zone[];
  setLineProfile: (p: LineProfile) => void;
  setSystemProfile: (p: SystemProfile) => void;
  setZones: (z: Zone[]) => void;
  updateSystemProfile: (partial: Partial<SystemProfile>) => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  lineProfile: null,
  systemProfile: null,
  zones: [],
  setLineProfile: (p) => set({ lineProfile: p }),
  setSystemProfile: (p) => set({ systemProfile: p }),
  setZones: (z) => set({ zones: z }),
  updateSystemProfile: (partial) =>
    set((state) => ({
      systemProfile: state.systemProfile ? { ...state.systemProfile, ...partial } : null,
    })),
}));
