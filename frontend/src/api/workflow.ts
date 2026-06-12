import { post } from './client'
import type { WorkflowSheets } from './types'

export const connectSheets = (target: string, master: string, mix: string) =>
  post<WorkflowSheets>('/api/connectWorkflowSheets', { args: [target, master, mix] })

export const getWorkflowSheets = () =>
  post<WorkflowSheets>('/api/getWorkflowSheets', { args: [] })
