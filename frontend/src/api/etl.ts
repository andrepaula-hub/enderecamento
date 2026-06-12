import { get, post } from './client'
import type { ApiResponse } from './types'

export interface JobResponse {
  job_id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: unknown
  error?: string
  type?: string
  payload?: unknown
  created_at?: string
  updated_at?: string
}

export const runEtl = () =>
  post<JobResponse>('/api/etl/run', { args: [] })

export const getJobStatus = (jobId: string) =>
  get<JobResponse>(`/api/jobs/${jobId}`)

export const buildSalesTarget = (payload: unknown) =>
  post<ApiResponse>('/api/buildMetabaseSalesTarget', { args: [payload] })

export const exportSalesXlsx = (payload: unknown) =>
  post<ApiResponse>('/api/exportMetabaseSalesXlsx', { args: [payload] })
