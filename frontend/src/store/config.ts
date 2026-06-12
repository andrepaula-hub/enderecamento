import { create } from 'zustand'
import type { StoreInfo, WorkflowSheetInfo } from '../api/types'

interface ConfigState {
  selectedStore: StoreInfo | null
  sheetLinks: {
    ender: string
    etl: string
    mix: string
    mapaEq: string
  }
  workflowSheets: {
    target: WorkflowSheetInfo | null
    master: WorkflowSheetInfo | null
    mix: WorkflowSheetInfo | null
  }
  setSelectedStore: (store: StoreInfo | null) => void
  setSheetLink: (key: keyof ConfigState['sheetLinks'], value: string) => void
  setWorkflowSheets: (sheets: ConfigState['workflowSheets']) => void
}

export const useConfigStore = create<ConfigState>((set) => ({
  selectedStore: null,
  sheetLinks: { ender: '', etl: '', mix: '', mapaEq: '' },
  workflowSheets: { target: null, master: null, mix: null },

  setSelectedStore: (store) => set({ selectedStore: store }),
  setSheetLink: (key, value) =>
    set((s) => ({ sheetLinks: { ...s.sheetLinks, [key]: value } })),
  setWorkflowSheets: (workflowSheets) => set({ workflowSheets }),
}))
