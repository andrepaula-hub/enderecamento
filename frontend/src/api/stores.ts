import { get } from './client'
import type { StoreInfo } from './types'

const STORES_FALLBACK: StoreInfo[] = [
  { id: 'AP', nome: 'Alto de Pinheiros',   codigo: 'LOJA_AP_01' },
  { id: 'BF', nome: 'Barra Funda',          codigo: 'LOJA_BF_02' },
  { id: 'BK', nome: 'Brooklin',             codigo: 'LOJA_BK_03' },
  { id: 'HI', nome: 'Higienopolis',         codigo: 'LOJA_HI_04' },
  { id: 'MO', nome: 'Moema',                codigo: 'LOJA_MO_05' },
  { id: 'MB', nome: 'Morumbi',              codigo: 'LOJA_MB_06' },
  { id: 'JP', nome: 'Jardins / Pamplona',   codigo: 'LOJA_JP_07' },
  { id: 'PI', nome: 'Pinheiros',            codigo: 'LOJA_PI_08' },
  { id: 'VM', nome: 'Vila Mariana',         codigo: 'LOJA_VM_09' },
  { id: 'VO', nome: 'Vila Olimpia',         codigo: 'LOJA_VO_10' },
]

export async function listStores(): Promise<StoreInfo[]> {
  try {
    const res = await get<{ stores: StoreInfo[] }>('/api/stores')
    return res.stores ?? STORES_FALLBACK
  } catch {
    return STORES_FALLBACK
  }
}
