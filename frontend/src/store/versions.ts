import { create } from 'zustand'
import type { Version } from '../api/types'

interface VersionsState {
  versions: Version[]
  setVersions: (v: Version[]) => void
}

export const useVersionsStore = create<VersionsState>((set) => ({
  versions: [],
  setVersions: (versions) => set({ versions }),
}))
