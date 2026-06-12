import { create } from 'zustand'

type View = 'config' | 'map'
type Panel = 'metrics' | 'versions' | 'legend' | 'tweaks' | null

interface UIState {
  view: View
  openPanel: Panel
  pranchetaOpen: boolean
  selectedProduct: string | null
  highlightedProduct: string | null
  highlightedLocations: string[]
  configOpen: boolean
  // actions
  openMap: () => void
  openConfig: () => void
  setPanel: (panel: Panel) => void
  togglePrancheta: () => void
  selectProduct: (id: string | null) => void
  highlight: (productId: string | null, locations: string[]) => void
  clearHighlight: () => void
}

export const useUIStore = create<UIState>((set) => ({
  view: 'config',
  openPanel: null,
  pranchetaOpen: true,
  selectedProduct: null,
  highlightedProduct: null,
  highlightedLocations: [],
  configOpen: false,

  openMap: () => set({ view: 'map', configOpen: false }),
  openConfig: () => set({ view: 'config' }),
  setPanel: (panel) =>
    set((s) => ({ openPanel: s.openPanel === panel ? null : panel })),
  togglePrancheta: () => set((s) => ({ pranchetaOpen: !s.pranchetaOpen })),
  selectProduct: (id) => set({ selectedProduct: id }),
  highlight: (productId, locations) =>
    set({ highlightedProduct: productId, highlightedLocations: locations }),
  clearHighlight: () =>
    set({ highlightedProduct: null, highlightedLocations: [] }),
}))
