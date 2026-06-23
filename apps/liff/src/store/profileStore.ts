import { create } from 'zustand';

export interface SystemProfile {
  id: string;
  email: string;
  displayName?: string;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  role: string;
  preferredZoneId?: string | null;
  preferredZone?: { id: string; name: string; color: string } | null;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

interface ProfileStore {
  lineProfile: LineProfile | null;
  systemProfile: SystemProfile | null;
  zones: { id: string; name: string; color: string }[];
  setLineProfile: (p: LineProfile) => void;
  setSystemProfile: (p: SystemProfile) => void;
  setZones: (z: { id: string; name: string; color: string }[]) => void;
  updateSystemProfile: (partial: Partial<SystemProfile>) => void;
  clearProfiles: () => void;
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
  clearProfiles: () => set({ lineProfile: null, systemProfile: null, zones: [] }),
}));
