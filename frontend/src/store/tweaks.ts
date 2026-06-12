import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TweaksState {
  dark: boolean
  density: 'compact' | 'balanced' | 'spacious'
  colWidth: number
  setDark: (v: boolean) => void
  setDensity: (v: TweaksState['density']) => void
  setColWidth: (v: number) => void
}

export const useTweaksStore = create<TweaksState>()(
  persist(
    (set) => ({
      dark: false,
      density: 'balanced',
      colWidth: 380,
      setDark: (dark) => set({ dark }),
      setDensity: (density) => set({ density }),
      setColWidth: (colWidth) => set({ colWidth }),
    }),
    { name: 'dse-tweaks' }
  )
)
