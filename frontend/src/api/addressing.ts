import { post } from './client'
import type { AddressingState, ApiResponse } from './types'
import type { Product } from '../store/addressing'

export interface SuggestMove {
  escaninhoId: string
  productCode: string
  slot: 1 | 2
}

export interface SuggestAllocationsResponse {
  success: boolean
  error?: string
  moves: SuggestMove[]
  unallocated: string[]
  summary: { total_requested: number; proposed: number; unallocated: number }
}

export interface SuggestAllocationsPayload {
  unallocated_codes: string[]
  products_data: Product[]
  map_structure: Array<{ id: string; equipment: Array<{ id: string; tipo: string; niveis: number; escsPerNivel: number; cap: number }> }>
  allocations: Record<string, { p1: string | null; p2: string | null }>
  options: { allow_top_level?: boolean; allow_second_slot?: boolean; chemical_equipment_ids?: string[] }
}

export interface Move {
  from: string
  to: string
  product_id: string
  slot: number
}

export const getInitialData = () =>
  post<AddressingState>('/api/getInitialData', { args: [] })

export const getMapLoadStatus = () =>
  post<{ success: boolean; ready: boolean; rows: number }>('/api/getMapLoadStatus', { args: [] })

export const saveBatchMoves = (moves: Move[], options?: { skipFull?: boolean }) =>
  post<ApiResponse>('/api/saveBatchMoves', { args: [moves, options ?? {}] })

export const saveSingleMove = (move: Move) =>
  post<ApiResponse>('/api/saveSingleMove', { args: [move] })

export const executeSwap = (swapInfo: unknown) =>
  post<ApiResponse>('/api/executeSwap', { args: [swapInfo] })

export const generateSlotsFromCadastro = () =>
  post<ApiResponse>('/api/generateSlotsFromCadastro', { args: [true] })

export const suggestAllocations = (payload: SuggestAllocationsPayload) =>
  post<SuggestAllocationsResponse>('/api/addressing/suggest', payload)
