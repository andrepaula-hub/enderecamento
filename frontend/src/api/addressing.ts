import { post } from './client'
import type { AddressingState, ApiResponse } from './types'

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
