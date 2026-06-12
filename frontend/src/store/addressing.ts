import { create } from 'zustand'
import type { AddressingState } from '../api/types'

export interface Product {
  id: string
  nome: string
  grupo: string
  curva: string
  sub: string
  altura: number
  peso: number
  vol: number
  qtd: number
  degelo: string
  metodo: string
  escsNec: number
  pequeno: boolean
  fragil: boolean
  pesado: boolean
  alto: boolean
  quimico: boolean
  arm: string
  [key: string]: unknown
}

export interface Allocation {
  p1?: string | null
  p2?: string | null
}

interface AddressingStoreState {
  loaded: boolean
  loading: boolean
  error: string | null
  title: string
  products: Product[]
  productMap: Record<string, Product>
  allocations: Record<string, Allocation>
  unallocated: Record<string, Product>
  equipTypes: unknown[]
  metrics: unknown
  barcodeMap: Record<string, string>
  setFromApiResponse: (data: AddressingState) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  applyMoves: (
    moves: Array<{ from: string; to: string; product_id: string; slot: number }>
  ) => void
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const useAddressingStore = create<AddressingStoreState>((set) => ({
  loaded: false,
  loading: false,
  error: null,
  title: '',
  products: [],
  productMap: {},
  allocations: {},
  unallocated: {},
  equipTypes: [],
  metrics: {},
  barcodeMap: {},

  setFromApiResponse: (data) =>
    set({
      loaded: true,
      loading: false,
      error: null,
      title: data.spreadsheet_title,
      products: safeJson<Product[]>(data.all_products_json, []),
      productMap: safeJson<Record<string, Product>>(
        data.all_products_data_map_json,
        {}
      ),
      allocations: safeJson<Record<string, Allocation>>(
        data.product_location_map_json,
        {}
      ),
      unallocated: safeJson<Record<string, Product>>(
        data.unallocated_products_json,
        {}
      ),
      equipTypes: safeJson<unknown[]>(data.equipTypesJson, []),
      metrics: safeJson<unknown>(data.metrics_panel_data_json, {}),
      barcodeMap: safeJson<Record<string, string>>(data.barcode_map_json, {}),
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  applyMoves: (_moves) =>
    set((s) => {
      // optimistic local update — server is source of truth on next load
      const allocations = { ...s.allocations }
      return { allocations }
    }),
}))
