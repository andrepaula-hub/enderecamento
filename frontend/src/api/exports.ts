import { post } from './client'
import type { ApiResponse } from './types'

export const generateKdabraSheet = () =>
  post<ApiResponse>('/api/generateKdabraSheet', { args: [] })

export const generateKdabraEnderecarSheet = () =>
  post<ApiResponse>('/api/generateKdabraEnderecarSheet', { args: [] })

export const generateLayoutAtual = (deParaSheet?: string, outputSheet?: string) =>
  post<ApiResponse>('/api/generateLayoutAtual', {
    args: [
      deParaSheet ?? 'DePara',
      outputSheet ?? 'Plano_Enderecamento_Final_Layout_Atual',
    ],
  })

export const downloadFile = () => {
  window.location.href = '/api/download'
}
