export interface ApiResponse {
  success?: boolean
  error?: string
}

export interface WorkflowSheetInfo {
  sheet_id: string
  title: string
}

export interface WorkflowSheets extends ApiResponse {
  target: WorkflowSheetInfo | null
  master: WorkflowSheetInfo | null
  mix: WorkflowSheetInfo | null
}

export interface AddressingState extends ApiResponse {
  all_products_json: string
  product_location_map_json: string
  unallocated_products_json: string
  all_products_data_map_json: string
  equipTypesJson: string
  metrics_panel_data_json: string
  barcode_map_json: string
  spreadsheet_title: string
  failed_products_section: string
  limite_peso_kg: number
}

export interface Version {
  id: string
  name: string
  saved_at: string
  rows: number
}

export interface VersionsResponse extends ApiResponse {
  versions: Version[]
}

export interface StoreInfo {
  id: string
  nome: string
  codigo: string
}
