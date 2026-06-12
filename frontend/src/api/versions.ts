import { post } from './client'
import type { VersionsResponse, ApiResponse } from './types'

export const listVersions = () =>
  post<VersionsResponse>('/api/listPlanoVersions', { args: [] })

export const saveVersion = (name: string) =>
  post<ApiResponse>('/api/savePlanoVersion', { args: [name] })

export const restoreVersion = (id: string) =>
  post<ApiResponse>('/api/restorePlanoVersion', { args: [id] })

export const deleteVersion = (id: string) =>
  post<ApiResponse>('/api/deletePlanoVersion', { args: [id] })
