import { post } from './client'
import type { ApiResponse } from './types'

export const importCard175Metabase = (payload: unknown) =>
  post<ApiResponse>('/api/importCard175Metabase', { args: [payload] })
