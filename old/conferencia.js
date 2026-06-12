/** Otimizações:
 * - Usa TextFinder na coluna A (ProdutoID) para localizar o produto rapidamente.
 * - Evita ler planilha inteira; lê apenas a célula de localização correta (coluna C).
 * - Utilidades para obter/crear sheets e cabeçalhos.
 */

const SHEET_PROD = 'Produtos';
const SHEET_LOG  = 'Conferencias';
const SHEET_ADDR = 'Endereçamento';
const SHEET_INV  = 'INVENTARIO';
const SHEET_CODIGOS_BARRAS = 'Codigos de barras';
const SHEET_ESTOQUE = 'EstoqueKdabra';
const SHEET_LOCS = 'Localizações produtos';
const SHEET_ENDERECOS_BLOQUEADOS = 'Enderecos_Bloqueados';
const SHEET_ESTOQUE_ATUAL = 'Estoque_Atual';
const SHEET_SUBIR = 'Subir';

// Cabeçalhos
const HEAD_LOG  = ['DATA','HORA','Operador','ProdutoID','LocalInformado','LocalCorreto','Resultado'];
const HEAD_ADDR = ['DATA','HORA','Operador','ProdutoID','ProdutoNome','LocalCadastrado','LocalBipado','Resultado'];
const HEAD_INV  = ['DATA','HORA','EAN','QUANTIDADE','DESCRICAO','BIPAGEM N','OPERADOR','DATA_VALIDADE','RUA','ESTANTE','ESCANINHO','COD_PRODUTO'];
const HEAD_ESTOQUE = ['cod_produto','galpao','rua','estante','escaninho','tipo','quantidade','justificativa','data_validade','destino','unidade_medida'];
const HEAD_SUBIR = ['cod_produto','galpao','rua','estante','escaninho'];
const SCRIPT_VERSION = '2026-02-20_final';
const ADDRESSING_INDEX_CACHE_MS = 10 * 60 * 1000; // 10 minutos

// Cache de enderecos bloqueados (is_gondola = 0)
const blockedAddressCache = {};
const blockedAddressCacheTimestamp = {};
const BLOCKED_ADDR_CACHE_MS = 10 * 60 * 1000; // 10 minutos
const currentAddressCache = {};
const currentAddressCacheTimestamp = {};
const CURRENT_ADDR_CACHE_MS = 10 * 60 * 1000; // 10 minutos
const addressingIndexCache = {};
const addressingIndexCacheTimestamp = {};

// Enderecos bloqueados DESATIVADOS (nao usamos mais)
const ENABLE_BLOCKED_ADDR = false;

// Função auxiliar para garantir que todas as abas necessárias existam
function criarAbasNecessarias(storeName) {
  getConferenciaSheet_(storeName, SHEET_ESTOQUE, HEAD_ESTOQUE);
  return {status: 'ok', msg: 'Abas criadas/verificadas com sucesso.'};
}

function getScriptVersion() {
  return { status: 'ok', version: SCRIPT_VERSION };
}

function normalizeProductCodeValue_(value) {
  return String(value || '').trim();
}

function getAddressingIndex_(storeName, forceRefresh) {
  const storeKey = normalizeStoreName_(storeName);
  const now = Date.now();
  if (!forceRefresh &&
      addressingIndexCache[storeKey] &&
      addressingIndexCacheTimestamp[storeKey] &&
      (now - addressingIndexCacheTimestamp[storeKey]) < ADDRESSING_INDEX_CACHE_MS) {
    return addressingIndexCache[storeKey];
  }

  const index = {
    barcodeToProductCode: {},
    productCodeToBarcode: {},
    productCodeToLocations: {},
    barcodeToLocations: {},
    barcodeToDescription: {},
    productCodeToDescription: {}
  };

  const locSheet = getConferenciaSheetReadOnly_(storeName, SHEET_LOCS);
  if (locSheet) {
    const lastRow = locSheet.getLastRow();
    if (lastRow >= 2) {
      const locData = locSheet.getRange(2, 1, lastRow - 1, 10).getDisplayValues();
      for (let i = 0; i < locData.length; i++) {
        const locationId = String(locData[i][0] || '').trim();
        const productCode = normalizeProductCodeValue_(locData[i][9]);
        if (!locationId || !productCode) continue;
        if (!index.productCodeToLocations[productCode]) {
          index.productCodeToLocations[productCode] = [];
        }
        index.productCodeToLocations[productCode].push(locationId);
      }
    }
  }

  Object.keys(index.productCodeToLocations).forEach(productCode => {
    index.productCodeToLocations[productCode] = [...new Set(index.productCodeToLocations[productCode])];
  });

  const barcodeSheet = getCodigosBarrasSheetReadOnly_(storeName);
  if (barcodeSheet) {
    const lastRow = barcodeSheet.getLastRow();
    if (lastRow >= 2) {
      const barcodeData = barcodeSheet.getRange(2, 2, lastRow - 1, 3).getDisplayValues();
      for (let i = 0; i < barcodeData.length; i++) {
        const productCode = normalizeProductCodeValue_(barcodeData[i][0]);
        const descricao = String(barcodeData[i][1] || '').trim();
        const barcode = String(barcodeData[i][2] || '').trim();
        const barcodeNorm = normalizeBarcodeValue_(barcode);

        if (productCode) {
          if (descricao && !index.productCodeToDescription[productCode]) {
            index.productCodeToDescription[productCode] = descricao;
          }
          if (barcodeNorm && !index.productCodeToBarcode[productCode]) {
            index.productCodeToBarcode[productCode] = barcode;
          }
        }

        if (!barcodeNorm) continue;
        if (productCode && !index.barcodeToProductCode[barcodeNorm]) {
          index.barcodeToProductCode[barcodeNorm] = productCode;
        }
        if (descricao && !index.barcodeToDescription[barcodeNorm]) {
          index.barcodeToDescription[barcodeNorm] = descricao;
        }
      }
    }
  }

  const prodSheet = getConferenciaSheetReadOnly_(storeName, SHEET_PROD);
  if (prodSheet) {
    const lastRow = prodSheet.getLastRow();
    if (lastRow >= 2) {
      const prodData = prodSheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
      for (let i = 0; i < prodData.length; i++) {
        const barcode = String(prodData[i][0] || '').trim();
        const descricao = String(prodData[i][1] || '').trim();
        const barcodeNorm = normalizeBarcodeValue_(barcode);
        if (barcodeNorm && descricao && !index.barcodeToDescription[barcodeNorm]) {
          index.barcodeToDescription[barcodeNorm] = descricao;
        }
      }
    }
  }

  Object.keys(index.barcodeToProductCode).forEach(barcodeNorm => {
    const productCode = index.barcodeToProductCode[barcodeNorm];
    const locations = index.productCodeToLocations[productCode];
    if (locations && locations.length) {
      index.barcodeToLocations[barcodeNorm] = locations;
    }
  });

  addressingIndexCache[storeKey] = index;
  addressingIndexCacheTimestamp[storeKey] = now;
  return index;
}

function getAddressingRecordByBarcode_(storeName, barcode) {
  const barcodeNorm = normalizeBarcodeValue_(barcode);
  if (!barcodeNorm) return null;

  const index = getAddressingIndex_(storeName);
  const productCode = index.barcodeToProductCode[barcodeNorm] || '';
  let locais = [];
  if (productCode && index.productCodeToLocations[productCode]) {
    locais = index.productCodeToLocations[productCode].slice();
  } else if (index.barcodeToLocations[barcodeNorm]) {
    locais = index.barcodeToLocations[barcodeNorm].slice();
  }

  const descricao = index.barcodeToDescription[barcodeNorm] ||
    (productCode ? index.productCodeToDescription[productCode] : '') ||
    '';

  if ((!locais || locais.length === 0) && !productCode && !descricao) {
    return null;
  }

  return {
    barcode: String(barcode || '').trim(),
    barcodeNorm: barcodeNorm,
    codProduto: productCode,
    descricao: descricao,
    locaisCompletos: locais
  };
}

// Garante cabeçalho da aba Endereçamento com coluna ProdutoNome após ProdutoID
function ensureEnderecoHeaders_(storeName) {
  const sh = getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (!sh) return null;

  const lastCol = Math.max(sh.getLastColumn(), HEAD_ADDR.length);
  let headers = [];
  if (lastCol > 0) {
    headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  }
  const hasAny = headers.some(h => h);
  if (!hasAny) {
    sh.getRange(1, 1, 1, HEAD_ADDR.length).setValues([HEAD_ADDR]);
    return { sheet: sh, colProdutoId: 4, colProdutoNome: 5, inserted: true };
  }

  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : String(v || '').toLowerCase().replace(/\s+/g, ''));
  const idxProdutoId = headers.findIndex(h => norm(h) === 'produtoid');
  if (idxProdutoId < 0) {
    sh.getRange(1, 1, 1, HEAD_ADDR.length).setValues([HEAD_ADDR]);
    return { sheet: sh, colProdutoId: 4, colProdutoNome: 5, inserted: true };
  }

  let idxProdutoNome = headers.findIndex(h => norm(h) === 'produtonome');
  let inserted = false;
  if (idxProdutoNome < 0) {
    const colProdutoId = idxProdutoId + 1;
    sh.insertColumnAfter(colProdutoId);
    sh.getRange(1, colProdutoId + 1).setValue('ProdutoNome');
    idxProdutoNome = colProdutoId;
    inserted = true;
  }

  return { sheet: sh, colProdutoId: idxProdutoId + 1, colProdutoNome: idxProdutoNome + 1, inserted: inserted };
}

function normalizeSimple_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// Escolhe o índice correto quando há headers duplicados (ex: "Resultado")
// Se preferValue for informado, tenta achar a coluna com mais ocorrências desse valor.
function pickHeaderIndex_(headers, headerKey, data, preferValue) {
  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : normalizeSimple_(v));
  const target = norm(headerKey);
  const indices = [];
  for (let i = 0; i < headers.length; i++) {
    if (norm(headers[i]) === target) indices.push(i);
  }
  if (indices.length === 0) return -1;
  if (indices.length === 1) return indices[0];

  if (!preferValue || !Array.isArray(data) || data.length === 0) {
    return indices[indices.length - 1];
  }

  const targetVal = normalizeSimple_(preferValue);
  let bestIdx = indices[indices.length - 1];
  let bestCount = -1;
  const maxScan = Math.min(data.length, 2000);
  for (let k = 0; k < indices.length; k++) {
    const idx = indices[k];
    let count = 0;
    for (let r = 0; r < maxScan; r++) {
      const row = data[r];
      const cell = (row && idx < row.length) ? row[idx] : '';
      if (normalizeSimple_(cell) === targetVal) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function findHeaderIndexFirst_(headers, headerKey) {
  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : normalizeSimple_(v));
  const target = norm(headerKey);
  for (let i = 0; i < headers.length; i++) {
    if (norm(headers[i]) === target) return i;
  }
  return -1;
}

// Normaliza a estrutura da aba Endereçamento para o layout oficial
// Mantém apenas um "Resultado" (o que contém EndereçadoOK) e, opcionalmente, "Progresso".
function normalizarEnderecamentoEstrutura_(storeName, keepProgresso) {
  const sh = getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (!sh) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1) return { status: 'ok', total: 0, msg: 'Aba vazia.' };

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const data = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];

  const idxData = findHeaderIndexFirst_(headers, 'data');
  const idxHora = findHeaderIndexFirst_(headers, 'hora');
  const idxOper = findHeaderIndexFirst_(headers, 'operador');
  const idxProdId = findHeaderIndexFirst_(headers, 'produtoid');
  const idxProdNome = findHeaderIndexFirst_(headers, 'produtonome');
  const idxLocalCad = findHeaderIndexFirst_(headers, 'localcadastrado');
  const idxLocalBip = findHeaderIndexFirst_(headers, 'localbipado');
  const idxRes = pickHeaderIndex_(headers, 'resultado', data, 'EndereçadoOK');

  const resultadoIndices = [];
  for (let i = 0; i < headers.length; i++) {
    if (normalizeSimple_(headers[i]) === 'resultado') resultadoIndices.push(i);
  }
  const otherResultado = resultadoIndices.filter(i => i !== idxRes);
  const idxProg = keepProgresso ? findHeaderIndexFirst_(headers, 'progresso') : -1;

  const outHeaders = HEAD_ADDR.slice();
  if (keepProgresso && idxProg >= 0) outHeaders.push('Progresso');

  const outData = data.map(row => {
    let localBip = (idxLocalBip >= 0 && idxLocalBip < row.length) ? row[idxLocalBip] : '';
    if (!localBip || !String(localBip).trim()) {
      for (let k = 0; k < otherResultado.length; k++) {
        const v = row[otherResultado[k]];
        if (looksLikeEndereco_(v)) { localBip = v; break; }
      }
    }

    let resultado = (idxRes >= 0 && idxRes < row.length) ? row[idxRes] : '';
    if (!resultado || !String(resultado).trim()) {
      // Se o resultado principal está vazio, tenta recuperar de outra coluna "Resultado"
      for (let k = 0; k < otherResultado.length; k++) {
        const v = row[otherResultado[k]];
        const nv = normalizeSimple_(v);
        if (nv === 'enderecadook' || nv === 'enderecadoerro') {
          resultado = v;
          break;
        }
      }
    }
    if (looksLikeEndereco_(resultado) && (!localBip || !String(localBip).trim())) {
      localBip = resultado;
      resultado = '';
    }

    const outRow = [
      idxData >= 0 && idxData < row.length ? row[idxData] : '',
      idxHora >= 0 && idxHora < row.length ? row[idxHora] : '',
      idxOper >= 0 && idxOper < row.length ? row[idxOper] : '',
      idxProdId >= 0 && idxProdId < row.length ? row[idxProdId] : '',
      idxProdNome >= 0 && idxProdNome < row.length ? row[idxProdNome] : '',
      idxLocalCad >= 0 && idxLocalCad < row.length ? row[idxLocalCad] : '',
      localBip || '',
      resultado || ''
    ];

    if (keepProgresso && idxProg >= 0) {
      outRow.push(idxProg < row.length ? row[idxProg] : '');
    }
    return outRow;
  });

  sh.clearContents();
  sh.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders]);
  if (outData.length > 0) {
    sh.getRange(2, 1, outData.length, outHeaders.length).setValues(outData);
  }

  return {
    status: 'ok',
    total: outData.length,
    removedResultadoCols: Math.max(0, resultadoIndices.length - 1),
    keptProgresso: keepProgresso && idxProg >= 0
  };
}

function normalizarEnderecamentoEstruturaPinheiros() {
  return normalizarEnderecamentoEstrutura_('Pinheiros', true);
}

// Pacote completo de correção
function corrigirEnderecamentoFinal_(storeName) {
  const estrutura = normalizarEnderecamentoEstrutura_(storeName, true);
  const completo = corrigirEnderecamentoCompleto_(storeName);
  const preenchido = preencherProdutoNomeEnderecamento(storeName);
  return { status: 'ok', estrutura: estrutura, completo: completo, preenchido: preenchido };
}

function corrigirEnderecamentoFinalPinheiros() {
  return corrigirEnderecamentoFinal_('Pinheiros');
}

// Recalcula Resultado em branco usando Localizações produtos (fonte oficial)
// Opcionalmente corrige LocalCadastrado quando estiver vazio ou não parecer endereço.
function recalcularResultadoEmBranco_(storeName, fixLocalCadastrado) {
  const sh = getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (!sh) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { status: 'ok', updated: 0, msg: 'Aba vazia.' };

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : normalizeSimple_(v));
  const idxProdId = headers.findIndex(h => norm(h) === 'produtoid');
  const idxLocalCad = headers.findIndex(h => norm(h) === 'localcadastrado');
  const idxLocalBip = headers.findIndex(h => norm(h) === 'localbipado');
  const idxRes = pickHeaderIndex_(headers, 'resultado', data, 'EndereçadoOK');

  if (idxProdId < 0 || idxLocalBip < 0 || idxRes < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido na aba Endereçamento.' };
  }

  const locCache = new Map(); // cod_produto -> locaisCompletos
  let updated = 0;
  let updatedLocalCad = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const res = String(row[idxRes] || '').trim();
    const localBip = String(row[idxLocalBip] || '').trim();
    if (!localBip) continue;

    // Só recalcula Resultado se estiver vazio
    const needsResult = !res;
    const needsLocalCad = !!fixLocalCadastrado && idxLocalCad >= 0;

    if (!needsResult && !needsLocalCad) continue;

    const rawCod = String(row[idxProdId] || '').trim();
    if (!rawCod) continue;

    let locais = locCache.get(rawCod);
    if (!locais) {
      locais = getLocaisByProductCode_(storeName, rawCod);
      if (!locais || locais.length === 0) {
        const codByBarcode = getProductCodeByBarcode_(storeName, rawCod);
        if (codByBarcode && codByBarcode !== rawCod) {
          locais = getLocaisByProductCode_(storeName, codByBarcode);
          if (locais && locais.length > 0) {
            locCache.set(rawCod, locais);
          }
        }
      } else {
        locCache.set(rawCod, locais);
      }
    }
    if (!locais || locais.length === 0) continue;

    const locaisSet = new Set(locais.map(l => normalizeEnderecoKey_(l)));
    const bipList = parseEnderecoCell_(localBip).map(l => normalizeEnderecoKey_(l)).filter(Boolean);
    if (bipList.length === 0) continue;

    if (needsResult) {
      const ok = bipList.some(b => locaisSet.has(b));
      row[idxRes] = ok ? 'EndereçadoOK' : 'EndereçadoErro';
      updated++;
    }

    if (needsLocalCad && idxLocalCad >= 0) {
      const localCadAtual = String(row[idxLocalCad] || '').trim();
      const localCadParsed = parseEnderecoCell_(localCadAtual);
      if (!localCadAtual || localCadParsed.length === 0) {
        row[idxLocalCad] = formatarLocais(locais);
        updatedLocalCad++;
      }
    }
  }

  if (updated > 0 || updatedLocalCad > 0) {
    sh.getRange(2, 1, data.length, lastCol).setValues(data);
  }

  return { status: 'ok', updatedResultado: updated, updatedLocalCadastrado: updatedLocalCad };
}

function recalcularResultadoEmBrancoPinheiros() {
  return recalcularResultadoEmBranco_('Pinheiros', true);
}

// Versão rápida: usa cache em memória de Localizações produtos e Códigos de barras
// options = { startRow: 2, maxRows: 5000, fixLocalCadastrado: true, onlyMarkOk: false }
function recalcularResultadoEmBrancoRapido_(storeName, options) {
  const opts = options || {};
  const startRow = Math.max(2, opts.startRow || 2);
  const maxRows = Math.max(1, opts.maxRows || 5000);
  const fixLocalCadastrado = opts.fixLocalCadastrado !== false;
  const onlyMarkOk = opts.onlyMarkOk === true;

  const sh = getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (!sh) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < startRow) return { status: 'ok', updated: 0, msg: 'Sem linhas para processar.' };

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : normalizeSimple_(v));
  const idxProdId = headers.findIndex(h => norm(h) === 'produtoid');
  const idxLocalCad = headers.findIndex(h => norm(h) === 'localcadastrado');
  const idxLocalBip = headers.findIndex(h => norm(h) === 'localbipado');
  const data = sh.getRange(startRow, 1, Math.min(maxRows, lastRow - startRow + 1), lastCol).getValues();
  const idxRes = pickHeaderIndex_(headers, 'resultado', data, 'EndereçadoOK');

  if (idxProdId < 0 || idxLocalBip < 0 || idxRes < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido na aba Endereçamento.' };
  }

  // === monta mapa cod_produto -> Set(enderecos) em memória (Localizações produtos)
  const shLocs = getConferenciaSheetReadOnly_(storeName, SHEET_LOCS);
  if (!shLocs) return { status: 'error', msg: 'Aba Localizações produtos não encontrada.' };
  const lastRowLocs = shLocs.getLastRow();
  const lastColLocs = shLocs.getLastColumn();
  if (lastRowLocs < 2) return { status: 'error', msg: 'Aba Localizações produtos está vazia.' };
  const headersLocs = shLocs.getRange(1, 1, 1, lastColLocs).getValues()[0].map(h => String(h || '').trim());
  const normLocs = headersLocs.map(h => normalizeSimple_(h));
  const idxLoc = normLocs.findIndex(h => h === 'location_id' || h === 'endereco' || h === 'endereco_generated');
  const idxCod = normLocs.findIndex(h => h === 'product_code' || h === 'cod_produto');
  if (idxLoc < 0 || idxCod < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido em Localizações produtos (location_id/product_code).' };
  }
  const locData = shLocs.getRange(2, 1, lastRowLocs - 1, lastColLocs).getValues();
  const locaisMap = new Map();
  for (let i = 0; i < locData.length; i++) {
    const cod = String(locData[i][idxCod] || '').trim();
    const addr = normalizeEnderecoKey_(locData[i][idxLoc]);
    if (!cod || !addr) continue;
    if (!locaisMap.has(cod)) locaisMap.set(cod, new Set());
    locaisMap.get(cod).add(addr);
  }

  // === mapa barcode -> cod_produto (para fallback rápido)
  const barcodeToCod = new Map();
  const shCod = getCodigosBarrasSheetReadOnly_(storeName);
  if (shCod) {
    const lastRowCod = shCod.getLastRow();
    if (lastRowCod > 1) {
      const codData = shCod.getRange(2, 1, lastRowCod - 1, 4).getValues();
      for (let i = 0; i < codData.length; i++) {
        const cod = String(codData[i][1] || '').trim(); // coluna B
        const bar = String(codData[i][3] || '').trim(); // coluna D
        if (!cod || !bar) continue;
        const normBar = normalizeBarcodeValue_(bar);
        if (normBar) barcodeToCod.set(normBar, cod);
      }
    }
  }

  let updated = 0;
  let updatedLocalCad = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const res = String(row[idxRes] || '').trim();
    const localBip = String(row[idxLocalBip] || '').trim();
    if (!localBip) continue;

    const needsResult = !res;
    const needsLocalCad = fixLocalCadastrado && idxLocalCad >= 0;
    if (!needsResult && !needsLocalCad) continue;

    let cod = String(row[idxProdId] || '').trim();
    if (!cod) continue;

    let locaisSet = locaisMap.get(cod);
    if (!locaisSet) {
      // tenta via barcode->cod_produto
      const normBar = normalizeBarcodeValue_(cod);
      const mapped = normBar ? barcodeToCod.get(normBar) : null;
      if (mapped) locaisSet = locaisMap.get(mapped);
    }
    if (!locaisSet || locaisSet.size === 0) continue;

    const bipList = parseEnderecoCell_(localBip).map(l => normalizeEnderecoKey_(l)).filter(Boolean);
    if (bipList.length === 0) continue;

    if (needsResult) {
      const ok = bipList.some(b => locaisSet.has(b));
      if (ok) {
        row[idxRes] = 'EndereçadoOK';
        updated++;
      } else if (!onlyMarkOk) {
        row[idxRes] = 'EndereçadoErro';
        updated++;
      }
    }

    if (needsLocalCad && idxLocalCad >= 0) {
      const localCadAtual = String(row[idxLocalCad] || '').trim();
      const localCadParsed = parseEnderecoCell_(localCadAtual);
      if (!localCadAtual || localCadParsed.length === 0) {
        row[idxLocalCad] = formatarLocais(Array.from(locaisSet));
        updatedLocalCad++;
      }
    }
  }

  if (updated > 0 || updatedLocalCad > 0) {
    sh.getRange(startRow, 1, data.length, lastCol).setValues(data);
  }

  return {
    status: 'ok',
    updatedResultado: updated,
    updatedLocalCadastrado: updatedLocalCad,
    startRow: startRow,
    rowsProcessed: data.length
  };
}

function recalcularResultadoEmBrancoRapidoPinheiros() {
  return recalcularResultadoEmBrancoRapido_('Pinheiros', { fixLocalCadastrado: true });
}

// Normaliza barcode preservando códigos alfanuméricos (ex: CNRA5)
function normalizeBarcodeValue_(value) {
  let s = String(value || '').trim();
  if (!s) return '';
  s = s.replace(/\s+/g, '');
  // Se tiver letras, mantém alfanumérico (upper)
  if (/[A-Za-z]/.test(s)) {
    return s.toUpperCase();
  }
  // Só números: remove qualquer coisa que não seja dígito
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  // Normaliza zeros à esquerda
  const noLeading = digits.replace(/^0+/, '');
  return noLeading || '0';
}

function looksLikeEndereco_(value) {
  const v = String(value || '').toUpperCase().trim();
  if (!v) return false;
  // aceita estante com 1 a 3 dígitos (ex: 03, 123)
  return /-R\d+/.test(v) && /-\d{1,3}-/.test(v);
}

function isResultadoEnderecamento_(value) {
  const v = normalizeSimple_(value);
  return v === 'enderecadook' || v === 'enderecadoerro';
}

// Expande intervalo "A até B" quando compartilham o mesmo prefixo (galpao/rua/estante)
function expandEnderecoRange_(start, end) {
  const rawA = String(start || '').trim();
  const rawB = String(end || '').trim();
  const a = normalizeEnderecoKey_(rawA);
  let b = normalizeEnderecoKey_(rawB);
  if (!a || !b) return [a, b].filter(Boolean);
  if (a === b) return [a];

  const pa = a.split('-');
  let pb = b.split('-');

  // Se o final vier curto (ex: "3G", "003-3G" ou "R1-003-3G"), reconstrói usando a base do início
  if (rawB && !rawB.includes('-') && pa.length >= 3) {
    b = normalizeEnderecoKey_(`${pa[0]}-${pa[1]}-${pa[2]}-${rawB}`);
    pb = b.split('-');
  } else if (rawB && pb.length < pa.length && pa.length >= 3) {
    const parts = rawB.replace(/[–—]/g, '-').split('-').filter(Boolean);
    if (parts.length === 1) {
      b = normalizeEnderecoKey_(`${pa[0]}-${pa[1]}-${pa[2]}-${parts[0]}`);
    } else if (parts.length === 2) {
      b = normalizeEnderecoKey_(`${pa[0]}-${pa[1]}-${parts[0]}-${parts[1]}`);
    } else if (parts.length === 3) {
      b = normalizeEnderecoKey_(`${pa[0]}-${parts[0]}-${parts[1]}-${parts[2]}`);
    }
    pb = b.split('-');
  }

  if (pa.length < 4 || pb.length < 4) return [a, b];
  if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2]) return [a, b];

  const la = pa[3];
  const lb = pb[3];
  const ma = la.match(/^(\d+)([A-Z])?$/);
  const mb = lb.match(/^(\d+)([A-Z])?$/);
  if (!ma || !mb) return [a, b];
  if (ma[1] !== mb[1]) return [a, b];

  const num = ma[1];
  const sa = ma[2] || '';
  const sb = mb[2] || '';

  // Expande letras (ex: 3A até 3G)
  if (sa && sb) {
    let startChar = sa.charCodeAt(0);
    let endChar = sb.charCodeAt(0);
    if (startChar > endChar) {
      const t = startChar; startChar = endChar; endChar = t;
    }
    const out = [];
    for (let c = startChar; c <= endChar; c++) {
      out.push(`${pa[0]}-${pa[1]}-${pa[2]}-${num}${String.fromCharCode(c)}`);
    }
    return out;
  }

  // Expande números puros (raro)
  if (!sa && !sb) {
    const ia = parseInt(la, 10);
    const ib = parseInt(lb, 10);
    if (isNaN(ia) || isNaN(ib)) return [a, b];
    const startNum = Math.min(ia, ib);
    const endNum = Math.max(ia, ib);
    const out = [];
    for (let i = startNum; i <= endNum; i++) {
      out.push(`${pa[0]}-${pa[1]}-${pa[2]}-${i}`);
    }
    return out;
  }

  return [a, b];
}

// Quebra célula com endereços (separadores / e "até") em lista normalizada
function parseEnderecoCell_(value) {
  if (value === null || value === undefined) return [];
  const raw = String(value || '').trim();
  if (!raw) return [];
  const parts = raw.split(/[,;\n|]/);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = String(parts[i] || '').trim();
    if (!p) continue;
    if (/\bat[eé]\b/i.test(p)) {
      const ab = p.split(/\bat[eé]\b/i);
      const a = String(ab[0] || '').trim();
      const b = String(ab[1] || '').trim();
      if (a && b) {
        out.push(...expandEnderecoRange_(a, b));
      } else {
        const n = normalizeEnderecoKey_(p);
        if (n) out.push(n);
      }
    } else {
      const n = normalizeEnderecoKey_(p);
      if (n) out.push(n);
    }
  }
  return out;
}

// Corrige headers/dados quando a coluna ProdutoNome não existe (ou ficou desalinhado)
function corrigirEnderecamento_(storeName) {
  const sh = getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (!sh) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1) return { status: 'ok', updated: 0, msg: 'Aba vazia.' };

  const headers = sh.getRange(1, 1, 1, Math.max(lastCol, HEAD_ADDR.length)).getValues()[0];
  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : normalizeSimple_(v));
  const hasAnyHeader = headers.some(h => String(h || '').trim());
  if (!hasAnyHeader) {
    sh.getRange(1, 1, 1, HEAD_ADDR.length).setValues([HEAD_ADDR]);
    return { status: 'ok', updated: 0, msg: 'Cabeçalho criado.' };
  }

  const idxProdutoId = headers.findIndex(h => norm(h) === 'produtoid');
  if (idxProdutoId < 0) {
    sh.getRange(1, 1, 1, HEAD_ADDR.length).setValues([HEAD_ADDR]);
    return { status: 'ok', updated: 0, msg: 'Cabeçalho ajustado.' };
  }

  let idxProdutoNome = headers.findIndex(h => norm(h) === 'produtonome');
  const colProdutoId = idxProdutoId + 1; // 1-based
  let colProdutoNome = idxProdutoNome >= 0 ? idxProdutoNome + 1 : colProdutoId + 1;
  let inserted = false;

  // Se ProdutoNome não existe, decide se precisa inserir coluna (layout antigo)
  if (idxProdutoNome < 0) {
    const sampleSize = Math.min(50, Math.max(0, lastRow - 1));
    let enderecoLike = false;
    if (sampleSize > 0) {
      const sample = sh.getRange(2, colProdutoNome, sampleSize, 1).getValues();
      for (let i = 0; i < sample.length; i++) {
        if (looksLikeEndereco_(sample[i][0])) {
          enderecoLike = true;
          break;
        }
      }
    }

    if (enderecoLike) {
      sh.insertColumnAfter(colProdutoId);
      inserted = true;
    }
    colProdutoNome = colProdutoId + 1;
  }

  // Ajusta somente os headers esperados sem sobrescrever colunas extras
  sh.getRange(1, colProdutoNome).setValue('ProdutoNome');
  sh.getRange(1, colProdutoNome + 1).setValue('LocalCadastrado');
  sh.getRange(1, colProdutoNome + 2).setValue('LocalBipado');
  sh.getRange(1, colProdutoNome + 3).setValue('Resultado');

  const info = ensureEnderecoHeaders_(storeName);
  if (!info || !info.sheet) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };
  const updated = backfillEnderecoProdutoNome_(storeName, info.sheet, info.colProdutoId, info.colProdutoNome);
  return { status: 'ok', updated: updated, inserted: inserted };
}

// Atalho para Pinheiros (corrige header + backfill)
function corrigirEnderecamentoPinheiros() {
  return corrigirEnderecamento_('Pinheiros');
}

// Corrige linhas desalinhadas + corrige ProdutoID quando nome não bate com cod_produto
function corrigirEnderecamentoCompleto_(storeName) {
  const sh = getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (!sh) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const info = ensureEnderecoHeaders_(storeName);
  if (!info || !info.sheet) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { status: 'ok', shifted: 0, updatedIds: 0, backfilled: 0, msg: 'Aba vazia.' };

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const norm = v => (typeof normalizeHeader_ === 'function' ? normalizeHeader_(v) : normalizeSimple_(v));

  const idxProdId = headers.findIndex(h => norm(h) === 'produtoid');
  const idxProdNome = headers.findIndex(h => norm(h) === 'produtonome');
  const idxLocalCad = headers.findIndex(h => norm(h) === 'localcadastrado');
  const idxLocalBip = headers.findIndex(h => norm(h) === 'localbipado');
  const fullData = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idxRes = pickHeaderIndex_(headers, 'resultado', fullData, 'EndereçadoOK');

  if (idxProdId < 0 || idxProdNome < 0 || idxLocalCad < 0 || idxLocalBip < 0 || idxRes < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido na aba Endereçamento.' };
  }

  const startCol = idxProdId + 1;
  const numCols = idxRes - idxProdId + 1;
  const data = sh.getRange(2, startCol, lastRow - 1, numCols).getValues();

  const prodNomeOffset = idxProdNome - idxProdId;
  const localCadOffset = idxLocalCad - idxProdId;
  const localBipOffset = idxLocalBip - idxProdId;
  const resOffset = idxRes - idxProdId;

  const lookups = buildCodigosBarrasLookups_(storeName);
  let shifted = 0;
  let updatedIds = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const prodNome = String(row[prodNomeOffset] || '').trim();
    const localCad = String(row[localCadOffset] || '').trim();
    const localBip = String(row[localBipOffset] || '').trim();
    const resultado = String(row[resOffset] || '').trim();

    // Corrige linhas desalinhadas (ProdutoNome contém endereço)
    const prodNomeIsAddr = looksLikeEndereco_(prodNome);
    const localCadIsAddr = looksLikeEndereco_(localCad);
    const localBipIsResult = isResultadoEnderecamento_(localBip);

    if (prodNomeIsAddr && (localBipIsResult || (localCadIsAddr && !resultado))) {
      row[resOffset] = localBipIsResult ? localBip : resultado;
      row[localBipOffset] = localCad;
      row[localCadOffset] = prodNome;
      row[prodNomeOffset] = '';
      shifted++;
    }

    // Corrige ProdutoID quando nome não bate com cod_produto (casos BEBCH5/BEB1 etc)
    const prodId = String(row[0] || '').trim(); // ProdutoID é sempre o primeiro do range
    const nomeAtual = String(row[prodNomeOffset] || '').trim();
    if (prodId && nomeAtual) {
      const descByCod = lookups.byCod.get(prodId);
      const normNome = normalizeSimple_(nomeAtual);
      if (descByCod && normalizeSimple_(descByCod) !== normNome) {
        const newCod = lookups.byDesc.get(normNome);
        if (newCod && newCod !== prodId) {
          row[0] = newCod;
          updatedIds++;
        }
      } else if (!descByCod) {
        const newCod = lookups.byDesc.get(normNome);
        if (newCod && newCod !== prodId) {
          row[0] = newCod;
          updatedIds++;
        }
      }
    }
  }

  if (shifted > 0 || updatedIds > 0) {
    sh.getRange(2, startCol, data.length, numCols).setValues(data);
  }

  const backfilled = backfillEnderecoProdutoNome_(storeName, info.sheet, info.colProdutoId, info.colProdutoNome);
  return { status: 'ok', shifted: shifted, updatedIds: updatedIds, backfilled: backfilled };
}

function corrigirEnderecamentoCompletoPinheiros() {
  return corrigirEnderecamentoCompleto_('Pinheiros');
}

// Preenche ProdutoNome para linhas existentes na aba Endereçamento
function backfillEnderecoProdutoNome_(storeName, sh, colProdutoId, colProdutoNome) {
  if (!sh) return 0;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sh.getRange(2, colProdutoId, lastRow - 1, 1).getValues();
  const nomes = sh.getRange(2, colProdutoNome, lastRow - 1, 1).getValues();
  const lookups = buildDescricaoLookups_(storeName);
  let updated = 0;

  for (let i = 0; i < ids.length; i++) {
    if (nomes[i][0]) continue;
    const rawId = String(ids[i][0] || '').trim();
    if (!rawId) continue;
    const desc = lookups.byEan.get(rawId) || lookups.byBarcode.get(rawId) || lookups.byCod.get(rawId);
    if (desc) {
      nomes[i][0] = desc;
      updated++;
    }
  }

  if (updated > 0) {
    sh.getRange(2, colProdutoNome, nomes.length, 1).setValues(nomes);
  }
  return updated;
}

// Lookup em lote para descrições (Produtos e Codigos de barras)
function buildDescricaoLookups_(storeName) {
  const byEan = new Map();
  const byCod = new Map();
  const byBarcode = new Map();

  const shProd = getConferenciaSheetReadOnly_(storeName, SHEET_PROD);
  if (shProd) {
    const lastRow = shProd.getLastRow();
    if (lastRow > 1) {
      const data = shProd.getRange(2, 1, lastRow - 1, 2).getValues(); // A: EAN, B: descrição
      for (let i = 0; i < data.length; i++) {
        const ean = String(data[i][0] || '').trim();
        const desc = String(data[i][1] || '').trim();
        if (ean && desc && !byEan.has(ean)) {
          byEan.set(ean, desc);
        }
      }
    }
  }

  const shCod = getCodigosBarrasSheetReadOnly_(storeName);
  if (shCod) {
    const lastRow = shCod.getLastRow();
    if (lastRow > 1) {
      const data = shCod.getRange(2, 1, lastRow - 1, 4).getValues(); // B: cod_produto, C: descrição, D: barcode
      for (let i = 0; i < data.length; i++) {
        const cod = String(data[i][1] || '').trim();
        const desc = String(data[i][2] || '').trim();
        const barcode = String(data[i][3] || '').trim();
        if (cod && desc && !byCod.has(cod)) {
          byCod.set(cod, desc);
        }
        if (barcode && desc && !byBarcode.has(barcode)) {
          byBarcode.set(barcode, desc);
        }
      }
    }
  }

  return { byEan, byCod, byBarcode };
}

// Lookup para resolver cod_produto <-> descrição (usado para correções)
function buildCodigosBarrasLookups_(storeName) {
  const byDesc = new Map(); // desc(normalizada) -> cod_produto (somente se única/consistente)
  const byCod = new Map();  // cod_produto -> descrição
  const descToCodSet = new Map(); // desc(normalizada) -> Set(cod_produto)

  const shCod = getCodigosBarrasSheetReadOnly_(storeName);
  if (!shCod) return { byDesc, byCod };

  const lastRow = shCod.getLastRow();
  if (lastRow < 2) return { byDesc, byCod };

  const data = shCod.getRange(2, 1, lastRow - 1, 4).getValues(); // B: cod_produto, C: descrição, D: barcode
  for (let i = 0; i < data.length; i++) {
    const cod = String(data[i][1] || '').trim();
    const desc = String(data[i][2] || '').trim();
    if (!cod || !desc) continue;

    if (!byCod.has(cod)) {
      byCod.set(cod, desc);
    }

    const key = normalizeSimple_(desc);
    if (!descToCodSet.has(key)) descToCodSet.set(key, new Set());
    descToCodSet.get(key).add(cod);
  }

  // Só mantém descrições que apontam para UM ÚNICO cod_produto
  descToCodSet.forEach((setVal, key) => {
    if (setVal.size === 1) {
      byDesc.set(key, Array.from(setVal)[0]);
    }
  });

  return { byDesc, byCod };
}

// Função pública para forçar preenchimento de ProdutoNome na aba Endereçamento
function preencherProdutoNomeEnderecamento(storeName) {
  const info = ensureEnderecoHeaders_(storeName);
  if (!info || !info.sheet) {
    return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };
  }
  const updated = backfillEnderecoProdutoNome_(storeName, info.sheet, info.colProdutoId, info.colProdutoNome);
  return { status: 'ok', updated: updated };
}

// Atalho para Pinheiros
function preencherProdutoNomeEnderecamentoPinheiros() {
  return preencherProdutoNomeEnderecamento('Pinheiros');
}

// Função para retornar TODA a lista de produtos de uma vez (para busca local no frontend)
function getAllProductsList(storeName) {
  try {
    getAddressingIndex_(storeName);
    const sh = getConferenciaSheetReadOnly_(storeName, SHEET_PROD);
    if (!sh) {
      return {status: 'error', msg: 'Aba Produtos não encontrada', products: []};
    }
    
    const lastRow = sh.getLastRow();
    if (lastRow < 2) {
      return {status: 'ok', products: []};
    }
    
    // Lê colunas A (ProdutoID/EAN), B (Descrição) e C (LocalizacaoCorreta) de uma vez
    const dataRange = sh.getRange(2, 1, lastRow - 1, 3);
    const allData = dataRange.getValues();
    
    const products = [];
    const produtosVistos = new Set(); // Evita duplicatas
    
    for (let i = 0; i < allData.length; i++) {
      const ean = String(allData[i][0] || '').trim(); // Coluna A (ProdutoID/EAN)
      const descricao = String(allData[i][1] || '').trim(); // Coluna B (Descrição)
      const localizacao = String(allData[i][2] || '').trim(); // Coluna C (LocalizacaoCorreta)
      
      if (!descricao) continue;
      
      // Filtra apenas produtos que têm endereço (não pode ser "sem endereco")
      const temEndereco = localizacao && 
                         localizacao.toLowerCase() !== 'sem endereco' && 
                         localizacao.toLowerCase() !== 'sem endereço' &&
                         localizacao.length > 0;
      
      if (!temEndereco) continue;
      
      // Evita duplicatas usando descrição como chave
      if (!produtosVistos.has(descricao)) {
        const nomeNormalizado = normalizarTextoParaBusca(descricao);
        products.push({
          nome: descricao,
          nomeNormalizado: nomeNormalizado, // Já normalizado para busca rápida
          product_code: '', // Será buscado depois se necessário
          barcode: ean // EAN como barcode
        });
        produtosVistos.add(descricao);
      }
    }
    
    return {status: 'ok', products: products};
  } catch (e) {
    return {status: 'error', msg: e.message, products: []};
  }
}

/** Retorna {localCorreto, locaisCompletos} ou null se não achar. Assumimos colunas:
 * A: ProdutoID, C em diante: LocalizacoesCorretas
 * Lê todas as colunas de localização (C até encontrar vazia ou até coluna Z)
 * Otimizado: lê apenas as colunas necessárias
 */
function getLocalByBarcode_(storeName, barcode) {
  if (!barcode) return null;

  const barcodeStr = String(barcode).trim();
  const indexed = getAddressingRecordByBarcode_(storeName, barcodeStr);
  if (indexed) {
    const locaisIndexados = indexed.locaisCompletos || [];
    if (!locaisIndexados.length) {
      return (indexed.codProduto || indexed.descricao)
        ? {localCorreto: '', locaisCompletos: [], codProduto: indexed.codProduto || '', descricao: indexed.descricao || ''}
        : null;
    }
    return {
      localCorreto: formatarLocais(locaisIndexados),
      locaisCompletos: locaisIndexados,
      codProduto: indexed.codProduto || '',
      descricao: indexed.descricao || ''
    };
  }

  // Fallback para casos fora do índice
  const locaisByCod = getLocaisByProductCode_(storeName, barcodeStr);
  if (!locaisByCod || locaisByCod.length === 0) {
    return null;
  }

  return {
    localCorreto: formatarLocais(locaisByCod),
    locaisCompletos: locaisByCod,
    codProduto: barcodeStr,
    descricao: getDescricaoByProductCode_(storeName, barcodeStr) || ''
  };
}

function getLocaisByProductCode_(storeName, codProduto) {
  const cod = String(codProduto || '').trim();
  if (!cod) return [];

  const index = getAddressingIndex_(storeName);
  if (index.productCodeToLocations[cod]) {
    return index.productCodeToLocations[cod].slice();
  }

  const sh = getConferenciaSheet_(storeName, SHEET_LOCS);
  const last = sh.getLastRow();
  if (last < 2) return [];

  // Coluna J (10) = product_code, Coluna A (1) = location_id
  const rngColJ = sh.getRange(2, 10, last - 1, 1);
  const found = rngColJ.createTextFinder(cod)
                       .matchEntireCell(true)
                       .findAll();
  if (!found || found.length === 0) return [];

  const locais = [];
  for (const cell of found) {
    const row = cell.getRow();
    const loc = String(sh.getRange(row, 1).getValue() || '').trim();
    if (loc) locais.push(loc);
  }

  return [...new Set(locais)];
}

/** Formata múltiplas localizações em formato compacto e amigável
 * Exemplo: ["LJ120001-R1-002-2A", "LJ120001-R1-002-2B", ..., "LJ120001-R1-002-4E"]
 * Resultado: "LJ120001-R1-002-2A até 4E"
 */
function formatarLocais(locais) {
  if (!locais || locais.length === 0) return '';
  
  // Remove duplicatas e ordena
  const locaisUnicos = [...new Set(locais.map(l => l.trim()))].filter(l => l);
  if (locaisUnicos.length === 0) return '';
  if (locaisUnicos.length === 1) return locaisUnicos[0];
  
  const primeiro = locaisUnicos[0];
  const ultimo = locaisUnicos[locaisUnicos.length - 1];
  
  // Se são apenas 2 locais diferentes, mostra ambos
  if (locaisUnicos.length === 2) {
    return `${primeiro} até ${ultimo}`;
  }
  
  // Para mais de 2 locais, tenta encontrar a base comum
  // Procura o último separador comum (hífen, underscore, etc)
  const separadores = ['-', '_', '/'];
  let melhorBase = '';
  
  for (const sep of separadores) {
    const partes1 = primeiro.split(sep);
    const partes2 = ultimo.split(sep);
    
    if (partes1.length > 1 && partes1.length === partes2.length) {
      // Conta quantas partes são iguais (exceto a última)
      let iguais = 0;
      for (let i = 0; i < partes1.length - 1; i++) {
        if (partes1[i] === partes2[i]) {
          iguais++;
        } else {
          break;
        }
      }
      
      if (iguais > 0 && iguais >= partes1.length - 1) {
        // Todas as partes são iguais exceto a última - pode consolidar
        const base = partes1.slice(0, -1).join(sep) + sep;
        if (base.length > melhorBase.length) {
          melhorBase = base;
        }
      }
    }
  }
  
  // Se encontrou uma base comum significativa
  if (melhorBase && melhorBase.length > 5) {
    // Verifica se todos os locais seguem a mesma base
    const todosMesmaBase = locaisUnicos.every(loc => loc.startsWith(melhorBase));
    if (todosMesmaBase) {
      // Extrai apenas os sufixos diferentes
      const sufixoInicio = primeiro.replace(melhorBase, '').trim();
      const sufixoFim = ultimo.replace(melhorBase, '').trim();
      
      if (sufixoInicio && sufixoFim && sufixoInicio !== sufixoFim) {
        return `${primeiro} até ${ultimo}`;
      }
    }
  }
  
  // Se não conseguiu consolidar, mostra primeira / última
  return `${primeiro} até ${ultimo}`;
}

/** Retorna {descricao} do produto pelo EAN. Assumimos colunas:
 * A: ProdutoID (EAN), B: Descricao (ou outra coluna com descrição)
 * Otimizado: lê apenas as colunas necessárias em uma única operação
 */
function getDescricaoByEan_(storeName, ean) {
  if (!ean) return null;
  const indexed = getAddressingRecordByBarcode_(storeName, ean);
  if (indexed && indexed.descricao) {
    return { descricao: indexed.descricao };
  }
  const sh = getConferenciaSheet_(storeName, SHEET_PROD);
  const last = sh.getLastRow();
  if (last < 2) return null;

  // procura o EAN na coluna A (da linha 2 até o fim), match exato
  const rngColA = sh.getRange(2, 1, last - 1, 1);
  const found = rngColA.createTextFinder(String(ean))
                       .matchEntireCell(true)
                       .findNext();
  if (!found) return null;

  const row = found.getRow();
  // lê colunas B e D em uma única operação para melhor performance
  const values = sh.getRange(row, 2, 1, 3).getValues()[0]; // B, C, D
  let desc = String(values[0] || '').trim(); // coluna B
  if (!desc) {
    desc = String(values[2] || '').trim(); // coluna D
  }
  return { descricao: desc || 'Produto sem descrição' };
}

// ===== enderecos bloqueados (is_gondola = 0) =====
function normalizeEnderecoKey_(value) {
  let v = String(value || '').trim().toUpperCase();
  if (!v) return '';
  v = v.replace(/[–—]/g, '-');
  v = v.replace(/\s+/g, '');
  v = v.replace(/-+/g, '-');
  const parts = v.split('-').filter(Boolean);
  if (parts.length >= 3) {
    const seg = parts[2];
    const m = seg.match(/^(\d+)([A-Z]*)$/);
    if (m) {
      const num = m[1].padStart(3, '0');
      const suf = m[2] || '';
      parts[2] = num + suf;
    }
  }
  return parts.join('-');
}

function parseFlagValue_(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  const raw = (value === 0 || value === '0') ? '0' : String(value || '').trim();
  const v = normalizeSimple_(raw);
  if (!v) return null;
  if (v === '1' || v === 'true' || v === 'sim' || v === 'yes' || v === 'y') return 1;
  if (v === '0' || v === 'false' || v === 'nao' || v === 'n') return 0;
  const n = Number(raw.replace(',', '.'));
  if (!isNaN(n)) return n === 0 ? 0 : 1;
  return null;
}

function getEnderecosBloqueadosSheetReadOnly_(storeName) {
  const names = [
    SHEET_ENDERECOS_BLOQUEADOS,
    'Endereços_Bloqueados',
    'Endereços Bloqueados',
    'Enderecos Bloqueados',
    'Enderecos bloqueados',
    'Endereços bloqueados'
  ];
  for (const name of names) {
    const sh = getConferenciaSheetReadOnly_(storeName, name);
    if (sh) return sh;
  }
  return null;
}

function findHeaderRow_(sheet, lastCol) {
  const maxRows = Math.min(5, sheet.getLastRow());
  if (maxRows < 1) return { row: 1, headers: [] };
  const data = sheet.getRange(1, 1, maxRows, lastCol).getValues();
  for (let r = 0; r < data.length; r++) {
    const norm = data[r].map(h => normalizeSimple_(h));
    if (norm.includes('endereco_generated') || norm.includes('endereco') || norm.includes('location_id')) {
      return { row: r + 1, headers: data[r] };
    }
  }
  return { row: 1, headers: data[0] || [] };
}

function getBlockedAddressSet_(storeName) {
  if (!ENABLE_BLOCKED_ADDR) return new Set();
  try {
    const key = normalizeStoreName_(storeName);
    const now = new Date().getTime();
    if (blockedAddressCache[key] && blockedAddressCacheTimestamp[key] && (now - blockedAddressCacheTimestamp[key]) < BLOCKED_ADDR_CACHE_MS) {
      return blockedAddressCache[key];
    }

    const sh = getEnderecosBloqueadosSheetReadOnly_(storeName);
    if (!sh) {
      blockedAddressCache[key] = new Set();
      blockedAddressCacheTimestamp[key] = now;
      return blockedAddressCache[key];
    }

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      blockedAddressCache[key] = new Set();
      blockedAddressCacheTimestamp[key] = now;
      return blockedAddressCache[key];
    }

    const headerInfo = findHeaderRow_(sh, lastCol);
    const headers = headerInfo.headers.map(h => String(h || '').trim());
    const norm = headers.map(h => normalizeSimple_(h));
    const addrIdx = norm.findIndex(h => h === 'endereco_generated' || h === 'endereco' || h === 'location_id');
    const gondolaIdx = norm.findIndex(h => h === 'is_gondola');
    const blockedIdx = norm.findIndex(h => h === 'is_blocked');
    const galpaoIdx = norm.findIndex(h => h === 'galpao');
    let ruaIdx = norm.findIndex(h => h === 'rua');
    let posIdx = norm.findIndex(h => h === 'posicao_pallete');
    if (posIdx < 0) posIdx = norm.findIndex(h => h === 'posicao' || h === 'estante');
    let escIdx = norm.findIndex(h => h === 'escaninho_nivel');
    if (escIdx < 0) escIdx = norm.findIndex(h => h === 'escaninho');

    const data = lastRow > headerInfo.row
      ? sh.getRange(headerInfo.row + 1, 1, lastRow - headerInfo.row, lastCol).getValues()
      : [];
    const blocked = new Set();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      let addr = addrIdx >= 0 ? row[addrIdx] : '';
      if (!addr && galpaoIdx >= 0 && ruaIdx >= 0 && posIdx >= 0 && escIdx >= 0) {
        addr = buildEnderecoFromRow_(row[galpaoIdx], row[ruaIdx], row[posIdx], row[escIdx]);
      }
      if (!addr) continue;
      let shouldBlock = false;
      if (blockedIdx >= 0) {
        const flag = parseFlagValue_(row[blockedIdx]);
        if (flag === 1) shouldBlock = true;
      }
      if (!shouldBlock && gondolaIdx >= 0) {
        const flag = parseFlagValue_(row[gondolaIdx]);
        if (flag === 0) shouldBlock = true;
      }
      if (!shouldBlock) continue;
      blocked.add(normalizeEnderecoKey_(addr));
    }

    blockedAddressCache[key] = blocked;
    blockedAddressCacheTimestamp[key] = now;
    return blocked;
  } catch (e) {
    return new Set();
  }
}

function verificarEnderecoBloqueado(storeName, endereco) {
  const loja = storeName || 'Pinheiros';
  const blocked = getBlockedAddressSet_(loja);
  const key = normalizeEnderecoKey_(endereco);
  return { status: 'ok', endereco: key, bloqueado: blocked.has(key), totalBloqueados: blocked.size, loja: loja };
}

function verificarEnderecoBloqueadoPinheiros() {
  return verificarEnderecoBloqueado('Pinheiros', 'PINHEIROS1-R9-007-4E');
}

function listarEnderecosBloqueados(storeName, limit) {
  const loja = storeName || 'Pinheiros';
  const blocked = getBlockedAddressSet_(loja);
  const all = Array.from(blocked);
  const lim = (typeof limit === 'number' && limit > 0) ? limit : all.length;
  return { status: 'ok', total: all.length, enderecos: all.slice(0, lim), loja: loja };
}

function listarEnderecosBloqueadosPinheiros() {
  return listarEnderecosBloqueados('Pinheiros');
}

function exportarEnderecosBloqueadosCsv(storeName, folderId) {
  const loja = storeName || 'Pinheiros';
  const blocked = getBlockedAddressSet_(loja);
  const rows = Array.from(blocked).sort();
  const header = 'endereco';
  const escapeCsv = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const body = rows.map(escapeCsv).join('\n');
  const csv = header + (body ? '\n' + body : '');
  const tz = Session.getScriptTimeZone() || 'America/Sao_Paulo';
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  const name = `enderecos_bloqueados_${loja}_${stamp}.csv`;
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  const file = folder.createFile(name, csv, MimeType.CSV);
  const url = file.getUrl();
  const info = { status: 'ok', total: rows.length, fileId: file.getId(), url: url, loja: loja, folderId: folder.getId(), fileName: name };
  Logger.log('CSV salvo em: %s', url);
  Logger.log('Detalhes: %s', JSON.stringify(info));
  console.log('CSV salvo em:', url);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(`CSV criado: ${url}`, 'Exportação', 10);
  } catch (e) {
    // Ignora se não houver planilha ativa
  }
  return info;
}

function exportarEnderecosBloqueadosPinheirosCsv(folderId) {
  return exportarEnderecosBloqueadosCsv('Pinheiros', folderId);
}

function auditarEnderecosBloqueados(storeName, maxSamples) {
  const loja = storeName || 'Pinheiros';
  const sh = getConferenciaSheetReadOnly_(loja, SHEET_ADDR);
  if (!sh) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { status: 'ok', totalViolacoes: 0, samples: [], totalBloqueados: 0 };
  }

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const norm = headers.map(h => normalizeSimple_(h));
  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idxRes = pickHeaderIndex_(headers, 'resultado', data, 'EndereçadoOK');
  const idxCad = norm.indexOf('localcadastrado');
  const idxBip = norm.indexOf('localbipado');
  if (idxRes < 0 || idxCad < 0 || idxBip < 0) {
    return { status: 'error', msg: 'Cabeçalho de Endereçamento inválido (Resultado/LocalCadastrado/LocalBipado).' };
  }

  const blocked = getBlockedAddressSet_(loja);
  const samples = [];
  const maxS = (typeof maxSamples === 'number' && maxSamples > 0) ? maxSamples : 20;
  let total = 0;

  for (let i = 0; i < data.length; i++) {
    const res = String(data[i][idxRes] || '').trim();
    if (res !== 'EndereçadoOK') continue;
    const cad = normalizeEnderecoKey_(data[i][idxCad]);
    const bip = normalizeEnderecoKey_(data[i][idxBip]);
    if (blocked.has(cad) || blocked.has(bip)) {
      total++;
      if (samples.length < maxS) {
        samples.push({
          row: i + 2,
          localCadastrado: cad,
          localBipado: bip,
          resultado: res
        });
      }
    }
  }

  return { status: 'ok', totalViolacoes: total, samples: samples, totalBloqueados: blocked.size, loja: loja };
}

function auditarEnderecosBloqueadosPinheiros() {
  return auditarEnderecosBloqueados('Pinheiros');
}

// Gera lista de endereços pendentes (não endereçados, não bloqueados, só prateleira)
function gerarEnderecosPendentes_(storeName, sheetName, includeBlocked) {
  const loja = storeName || 'Pinheiros';
  const nomeAba = sheetName || 'Ainda_falta_calculado';
  const incluirBloqueados = includeBlocked === true;

  const shLocs = getConferenciaSheetReadOnly_(loja, SHEET_LOCS);
  if (!shLocs) return { status: 'error', msg: 'Aba Localizações produtos não encontrada.' };
  const shEnd = getConferenciaSheetReadOnly_(loja, SHEET_ADDR);
  if (!shEnd) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRowLocs = shLocs.getLastRow();
  const lastColLocs = shLocs.getLastColumn();
  if (lastRowLocs < 2 || lastColLocs < 1) {
    return { status: 'error', msg: 'Aba Localizações produtos está vazia.' };
  }

  const lastRowEnd = shEnd.getLastRow();
  const lastColEnd = shEnd.getLastColumn();
  if (lastRowEnd < 2 || lastColEnd < 1) {
    return { status: 'error', msg: 'Aba Endereçamento está vazia.' };
  }

  const headersLocs = shLocs.getRange(1, 1, 1, lastColLocs).getValues()[0].map(h => String(h || '').trim());
  const normLocs = headersLocs.map(h => normalizeSimple_(h));
  const idxLoc = normLocs.findIndex(h => h === 'location_id' || h === 'endereco' || h === 'endereco_generated');
  const idxTipo = normLocs.findIndex(h => h === 'tipo_equipamento_final' || h === 'tipo_equipamento');
  const idxCod = normLocs.findIndex(h => h === 'product_code' || h === 'cod_produto');
  const idxNome = normLocs.findIndex(h => h === 'product_name' || h === 'produto' || h === 'nome');

  if (idxLoc < 0 || idxCod < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido em Localizações produtos (location_id/product_code).' };
  }

  const headersEnd = shEnd.getRange(1, 1, 1, lastColEnd).getValues()[0].map(h => String(h || '').trim());
  const normEnd = headersEnd.map(h => normalizeSimple_(h));
  const idxCad = normEnd.findIndex(h => h === 'localcadastrado');
  const idxBip = normEnd.findIndex(h => h === 'localbipado');
  const endData = shEnd.getRange(2, 1, lastRowEnd - 1, lastColEnd).getValues();
  const idxRes = pickHeaderIndex_(headersEnd, 'resultado', endData, 'EndereçadoOK');

  if (idxCad < 0 || idxBip < 0 || idxRes < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido na aba Endereçamento (LocalCadastrado/LocalBipado).' };
  }

  // Conjunto de endereços já endereçados (LocalCadastrado ou LocalBipado)
  const enderecados = new Set();
  for (let i = 0; i < endData.length; i++) {
    const res = String(endData[i][idxRes] || '').trim();
    if (normalizeSimple_(res) !== 'enderecadook') continue;
    const cad = endData[i][idxCad];
    const bip = endData[i][idxBip];
    const cadList = parseEnderecoCell_(cad);
    const bipList = parseEnderecoCell_(bip);
    for (let j = 0; j < cadList.length; j++) enderecados.add(cadList[j]);
    for (let j = 0; j < bipList.length; j++) enderecados.add(bipList[j]);
  }

  // Endereços bloqueados (is_gondola=0 ou is_blocked=1)
  const blocked = incluirBloqueados ? new Set() : getBlockedAddressSet_(loja);

  // Lookup de descrição por cod_produto
  const lookups = buildCodigosBarrasLookups_(loja);
  const byCod = lookups.byCod || new Map();

  // Filtra Localizações produtos
  const locData = shLocs.getRange(2, 1, lastRowLocs - 1, lastColLocs).getValues();
  const out = [];
  const allowedTipos = new Set(['prateleira', 'prateleira_lateral', 'prateleira alta', 'prateleira_alta']);
  for (let i = 0; i < locData.length; i++) {
    const row = locData[i];
    const addr = normalizeEnderecoKey_(row[idxLoc]);
    if (!addr) continue;
    if (blocked.has(addr)) continue;
    if (enderecados.has(addr)) continue;

    if (idxTipo >= 0) {
      const tipo = String(row[idxTipo] || '').toLowerCase().trim();
      if (tipo && !allowedTipos.has(tipo)) continue;
    }

    const cod = String(row[idxCod] || '').trim();
    let nome = idxNome >= 0 ? String(row[idxNome] || '').trim() : '';
    if (!nome && cod && byCod.has(cod)) {
      nome = String(byCod.get(cod) || '').trim();
    }
    out.push([addr, nome, cod]);
  }

  // Escreve resultado
  const shOut = getConferenciaSheet_(loja, nomeAba, ['endereco_bipar','produto','cod_produto']);
  shOut.clearContents();
  shOut.getRange(1, 1, 1, 3).setValues([['endereco_bipar','produto','cod_produto']]);
  if (out.length > 0) {
    shOut.getRange(2, 1, out.length, 3).setValues(out);
  }

  // Validação: não retornar endereços que estejam na aba Endereçamento
  let violacoes = 0;
  for (let i = 0; i < out.length; i++) {
    if (enderecados.has(out[i][0])) violacoes++;
  }

  return { status: 'ok', total: out.length, violacoes: violacoes, loja: loja, aba: nomeAba };
}

function gerarEnderecosPendentesPinheiros() {
  return gerarEnderecosPendentes_('Pinheiros', 'Ainda_falta_calculado', false);
}

// Inclui endereços antes bloqueados na lista de pendências
function gerarEnderecosPendentesPinheirosIncluindoBloqueados() {
  return gerarEnderecosPendentes_('Pinheiros', 'Ainda_falta_calculado', true);
}

// Nova aba de pendências padrão: FALTA (inclui bloqueados)
function gerarEnderecosFaltaPinheiros() {
  return gerarEnderecosPendentes_('Pinheiros', 'FALTA', true);
}

function shouldIgnoreAddressing_(storeName, locaisOrigem, localDestino) {
  if (!ENABLE_BLOCKED_ADDR) return false;
  const blocked = getBlockedAddressSet_(storeName);
  if (!blocked || blocked.size === 0) return false;

  const destinoKey = normalizeEnderecoKey_(localDestino);
  if (destinoKey && blocked.has(destinoKey)) return true;

  if (Array.isArray(locaisOrigem)) {
    for (let i = 0; i < locaisOrigem.length; i++) {
      const key = normalizeEnderecoKey_(locaisOrigem[i]);
      if (key && blocked.has(key)) return true;
    }
  }
  return false;
}

function buildEnderecoFromRow_(galpao, rua, posicaoPallete, escaninhoNivel) {
  const g = String(galpao || '').trim();
  const r = String(rua || '').trim();
  let p = String(posicaoPallete || '').trim();
  const e = String(escaninhoNivel || '').trim();
  if (!g || !r || !p || !e) return '';
  const pNum = parseInt(p, 10);
  if (!isNaN(pNum)) {
    p = String(pNum).padStart(3, '0');
  }
  return `${g}-${r}-${p}-${e}`.toUpperCase();
}

function parseEnderecoParts_(value) {
  let raw = String(value || '').trim();
  if (!raw) return null;
  // Se vier com intervalo/concatenação (ex: "A até B"), pega o primeiro endereço normalizado
  const list = parseEnderecoCell_(raw);
  if (list && list.length > 0) {
    raw = list[0];
  }
  raw = String(raw || '').trim().toUpperCase();
  if (!raw) return null;
  const v = raw.replace(/[–—]/g, '-').replace(/\s+/g, '');
  const parts = v.split('-').filter(Boolean);
  if (parts.length < 4) return null;
  const galpao = parts[0];
  const rua = parts[1];
  let estante = parts[2];
  const escaninho = parts.slice(3).join('-');
  const m = estante.match(/^(\d+)([A-Z]*)$/);
  if (m) {
    const num = m[1].padStart(3, '0');
    estante = num + (m[2] || '');
  }
  return { galpao, rua, estante, escaninho };
}

function hasCodInSubir_(storeName, codProduto) {
  const cod = String(codProduto || '').trim();
  if (!cod) return false;
  const sh = getConferenciaSheet_(storeName, SHEET_SUBIR, HEAD_SUBIR);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const rng = sh.getRange(2, 1, last - 1, 1);
  const found = rng.createTextFinder(cod)
                   .matchEntireCell(true)
                   .findNext();
  return !!found;
}

function appendSubirRow_(storeName, codProduto, localBipado) {
  const cod = String(codProduto || '').trim();
  if (!cod) return false;
  if (hasCodInSubir_(storeName, cod)) return false;
  const parts = parseEnderecoParts_(localBipado);
  if (!parts) return false;
  const sh = getConferenciaSheet_(storeName, SHEET_SUBIR, HEAD_SUBIR);
  sh.appendRow([cod, parts.galpao, parts.rua, parts.estante, parts.escaninho]);
  const row = sh.getLastRow();
  // Garante estante como texto (mantém zeros à esquerda)
  sh.getRange(row, 4).setNumberFormat('@');
  sh.getRange(row, 4).setValue(parts.estante);
  return true;
}

// Gera/atualiza aba Subir com linhas EndereçadoOK da aba Endereçamento
function gerarSubirDeEnderecamento_(storeName, sheetName) {
  const loja = storeName || 'Pinheiros';
  const nomeAba = sheetName || SHEET_SUBIR;

  const shEnd = getConferenciaSheetReadOnly_(loja, SHEET_ADDR);
  if (!shEnd) return { status: 'error', msg: 'Aba Endereçamento não encontrada.' };

  const lastRow = shEnd.getLastRow();
  const lastCol = shEnd.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { status: 'ok', total: 0, msg: 'Aba Endereçamento vazia.' };
  }

  const headers = shEnd.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const norm = headers.map(h => normalizeSimple_(h));
  const data = shEnd.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idxRes = pickHeaderIndex_(headers, 'resultado', data, 'EndereçadoOK');
  const idxBip = norm.indexOf('localbipado');
  const idxCod = norm.indexOf('produtoid');
  if (idxRes < 0 || idxBip < 0 || idxCod < 0) {
    return { status: 'error', msg: 'Cabeçalho inválido na aba Endereçamento.' };
  }

  const out = [];
  const seenCods = new Set();
  for (let i = 0; i < data.length; i++) {
    const res = String(data[i][idxRes] || '').trim();
    if (res !== 'EndereçadoOK') continue;
    const local = String(data[i][idxBip] || '').trim();
    if (!local) continue;
    const parts = parseEnderecoParts_(local);
    if (!parts) continue;
    const cod = String(data[i][idxCod] || '').trim();
    if (!cod) continue;
    if (seenCods.has(cod)) continue;
    seenCods.add(cod);
    out.push([cod, parts.galpao, parts.rua, parts.estante, parts.escaninho]);
  }

  const shOut = getConferenciaSheet_(loja, nomeAba, HEAD_SUBIR);
  shOut.clearContents();
  shOut.getRange(1, 1, 1, HEAD_SUBIR.length).setValues([HEAD_SUBIR]);
  if (out.length > 0) {
    // Garante estante como texto (mantém zeros à esquerda)
    shOut.getRange(2, 4, out.length, 1).setNumberFormat('@');
    shOut.getRange(2, 1, out.length, HEAD_SUBIR.length).setValues(out);
  }

  return { status: 'ok', total: out.length, loja: loja, aba: nomeAba };
}

function gerarSubirDeEnderecamentoPinheiros() {
  return gerarSubirDeEnderecamento_('Pinheiros', SHEET_SUBIR);
}

// Gera aba Subir a partir de "Localizações produtos"
// options = { sheetName: 'Subir', uniquePerCod: true }
function gerarSubirDeLocalizacoes_(storeName, options) {
  const loja = storeName || 'Pinheiros';
  const opts = options || {};
  const nomeAba = opts.sheetName || SHEET_SUBIR;
  const uniquePerCod = opts.uniquePerCod !== false; // default true

  const shLocs = getConferenciaSheetReadOnly_(loja, SHEET_LOCS);
  if (!shLocs) return { status: 'error', msg: 'Aba Localizações produtos não encontrada.' };

  const lastRow = shLocs.getLastRow();
  const lastCol = shLocs.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { status: 'ok', total: 0, msg: 'Aba Localizações produtos vazia.' };
  }

  const headers = shLocs.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const norm = headers.map(h => normalizeSimple_(h));
  const idxLoc = norm.findIndex(h => h === 'location_id' || h === 'endereco' || h === 'endereco_generated');
  const idxCod = norm.findIndex(h => h === 'product_code' || h === 'cod_produto');
  const idxGalpao = norm.findIndex(h => h === 'galpao' || h === 'galpao_id');
  const idxRua = norm.findIndex(h => h === 'rua' || h === 'rua_num');
  let idxPos = norm.findIndex(h => h === 'posicao_pallete');
  if (idxPos < 0) idxPos = norm.findIndex(h => h === 'posicao' || h === 'estante');
  let idxEsc = norm.findIndex(h => h === 'escaninho_nivel');
  if (idxEsc < 0) idxEsc = norm.findIndex(h => h === 'escaninho');

  if (idxCod < 0 || (idxLoc < 0 && (idxGalpao < 0 || idxRua < 0 || idxPos < 0 || idxEsc < 0))) {
    return { status: 'error', msg: 'Cabeçalho inválido em Localizações produtos (product_code / location_id).' };
  }

  const data = shLocs.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const out = [];
  const seenCods = new Set();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const cod = String(row[idxCod] || '').trim();
    if (!cod) continue;
    if (uniquePerCod && seenCods.has(cod)) continue;

    let addr = idxLoc >= 0 ? String(row[idxLoc] || '').trim() : '';
    if (!addr && idxGalpao >= 0 && idxRua >= 0 && idxPos >= 0 && idxEsc >= 0) {
      addr = buildEnderecoFromRow_(row[idxGalpao], row[idxRua], row[idxPos], row[idxEsc]);
    }
    if (!addr) continue;

    const parts = parseEnderecoParts_(addr);
    if (!parts) continue;

    out.push([cod, parts.galpao, parts.rua, parts.estante, parts.escaninho]);
    if (uniquePerCod) seenCods.add(cod);
  }

  const shOut = getConferenciaSheet_(loja, nomeAba, HEAD_SUBIR);
  shOut.clearContents();
  shOut.getRange(1, 1, 1, HEAD_SUBIR.length).setValues([HEAD_SUBIR]);
  if (out.length > 0) {
    shOut.getRange(2, 4, out.length, 1).setNumberFormat('@');
    shOut.getRange(2, 1, out.length, HEAD_SUBIR.length).setValues(out);
  }

  return { status: 'ok', total: out.length, loja: loja, aba: nomeAba, uniquePerCod: uniquePerCod };
}

function gerarSubirDeLocalizacoesPinheiros() {
  return gerarSubirDeLocalizacoes_('Pinheiros', { sheetName: SHEET_SUBIR, uniquePerCod: true });
}

function getCurrentAddressesByProductCode_(storeName, codProduto) {
  const cod = String(codProduto || '').trim();
  if (!cod) return [];

  const key = normalizeStoreName_(storeName);
  const now = new Date().getTime();
  if (currentAddressCache[key] && currentAddressCacheTimestamp[key] && (now - currentAddressCacheTimestamp[key]) < CURRENT_ADDR_CACHE_MS) {
    return currentAddressCache[key].get(cod) || [];
  }

  const sh = getConferenciaSheetReadOnly_(storeName, SHEET_ESTOQUE_ATUAL);
  if (!sh) {
    currentAddressCache[key] = new Map();
    currentAddressCacheTimestamp[key] = now;
    return [];
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    currentAddressCache[key] = new Map();
    currentAddressCacheTimestamp[key] = now;
    return [];
  }

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim().toLowerCase());
  const idxCod = headers.findIndex(h => h === 'cod_produto' || h === 'codigo' || h === 'product_code');
  const idxGalpao = headers.findIndex(h => h === 'galpao' || h === 'galpao_id');
  const idxRua = headers.findIndex(h => h === 'rua' || h === 'rua_num');
  const idxPallete = headers.findIndex(h => h === 'posicao_pallete' || h === 'posicao' || h === 'estante');
  const idxEsc = headers.findIndex(h => h === 'escaninho_nivel' || h === 'escaninho');

  if (idxCod < 0 || idxGalpao < 0 || idxRua < 0 || idxPallete < 0 || idxEsc < 0) {
    currentAddressCache[key] = new Map();
    currentAddressCacheTimestamp[key] = now;
    return [];
  }

  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const map = new Map();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const codRow = String(row[idxCod] || '').trim();
    if (!codRow) continue;
    const addr = buildEnderecoFromRow_(row[idxGalpao], row[idxRua], row[idxPallete], row[idxEsc]);
    if (!addr) continue;
    if (!map.has(codRow)) map.set(codRow, new Set());
    map.get(codRow).add(addr);
  }

  const finalized = new Map();
  map.forEach((setVal, k) => {
    finalized.set(k, Array.from(setVal));
  });
  currentAddressCache[key] = finalized;
  currentAddressCacheTimestamp[key] = now;
  return finalized.get(cod) || [];
}

function getCurrentAddressByBarcode_(storeName, barcode) {
  const codProduto = getProductCodeByBarcode_(storeName, barcode) || barcode;
  const locais = getCurrentAddressesByProductCode_(storeName, codProduto);
  if (!locais || locais.length === 0) return null;
  return {
    localCorreto: formatarLocais(locais),
    locaisCompletos: locais
  };
}

// ===== conferência =====
function checkAndLog(storeName, barcode, localInformado, operador) {
  if (!operador) return {status:'no_operator', msg:'Bipe o crachá para iniciar.'};
  const prod = getLocalByBarcode_(storeName, barcode);
  if (!prod) return {status:'not_found', msg:'Produto não cadastrado.'};
  if (!prod.localCorreto || !prod.locaisCompletos || prod.locaisCompletos.length === 0) {
    return {status:'no_location', msg:'Produto sem localização cadastrada.'};
  }

  const informado = String(localInformado||'').trim().toUpperCase();
  // Verifica se o local informado corresponde a alguma das localizações cadastradas
  const ok = prod.locaisCompletos.some(loc => loc.toUpperCase() === informado);

  const dt = formatDateTimeBR();
  const shLog = getConferenciaSheet_(storeName, SHEET_LOG, HEAD_LOG);
  shLog.appendRow([dt.data, dt.hora, String(operador), barcode, informado, prod.localCorreto, ok ? 'OK' : 'Erro']);

  return ok
    ? {status:'ok', msg:'✅ Conferência OK!', localCorreto: prod.localCorreto, locaisCompletos: prod.locaisCompletos}
    : {status:'mismatch', msg:`❌ Local incorreto. O correto é: ${prod.localCorreto}`, localCorreto: prod.localCorreto, locaisCompletos: prod.locaisCompletos};
}

function confirmCorrection(storeName, barcode, localCorrigido, operador) {
  if (!operador) return {status:'no_operator', msg:'Bipe o crachá para iniciar.'};
  const prod = getLocalByBarcode_(storeName, barcode);
  if (!prod) return {status:'not_found', msg:'Produto não cadastrado.'};
  if (!prod.localCorreto || !prod.locaisCompletos || prod.locaisCompletos.length === 0) {
    return {status:'no_location', msg:'Produto sem localização cadastrada.'};
  }

  const corr = String(localCorrigido||'').trim().toUpperCase();
  // Verifica se o local corrigido corresponde a alguma das localizações cadastradas
  const ok = prod.locaisCompletos.some(loc => loc.toUpperCase() === corr);

  const dt = formatDateTimeBR();
  const shLog = getConferenciaSheet_(storeName, SHEET_LOG, HEAD_LOG);
  shLog.appendRow([dt.data, dt.hora, String(operador), barcode, corr, prod.localCorreto, ok ? 'Corrigido' : 'Erro']);

  return ok
    ? {status:'corrected_ok', msg:'✅ Correção confirmada. Conferência OK.', localCorreto: prod.localCorreto, locaisCompletos: prod.locaisCompletos}
    : {status:'corrected_mismatch', msg:`Ainda não confere. O correto é: ${prod.localCorreto}`, localCorreto: prod.localCorreto, locaisCompletos: prod.locaisCompletos};
}

// ===== funções auxiliares para EstoqueKdabra =====

/** Busca produtos por nome na aba "Localizações produtos"
 * Retorna lista única de produtos (sem duplicatas) que contêm o termo de busca
 * Estrutura: coluna K = product_name, coluna J = product_code, coluna D = barcode (da aba Codigos de barras)
 */
// Cache de produtos para melhor performance (evita ler planilha toda vez)
const produtosCache = {};
const produtosCacheTimestamp = {};
const produtosCacheNormalizado = {};
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos (cache mais longo pois dados mudam pouco)

function searchProductsByName(storeName, query) {
  if (!query || query.trim().length < 3) {
    return {status: 'ok', suggestions: []};
  }
  
  try {
    const queryNormalizado = normalizarTextoParaBusca(query);
    const storeKey = normalizeStoreName_(storeName);
    
    // Verifica se o cache está válido
    const now = new Date().getTime();
    if (!produtosCache[storeKey] || !produtosCacheNormalizado[storeKey] || !produtosCacheTimestamp[storeKey] || (now - produtosCacheTimestamp[storeKey]) > CACHE_DURATION) {
      // Carrega cache da aba "Produtos" (coluna B = Descrição, coluna C = LocalizacaoCorreta)
      const sh = getConferenciaSheetReadOnly_(storeName, SHEET_PROD);
      if (!sh) {
        return {status: 'error', msg: 'Aba Produtos não encontrada', suggestions: []};
      }
      
      const lastRow = sh.getLastRow();
      if (lastRow < 2) {
        return {status: 'ok', suggestions: []};
      }
      
      // Lê colunas A (ProdutoID/EAN), B (Descrição) e C (LocalizacaoCorreta) de uma vez
      const dataRange = sh.getRange(2, 1, lastRow - 1, 3);
      const allData = dataRange.getValues();
      
      // Log removido para melhor performance
      
      // Cria cache com Map para evitar duplicatas
      produtosCache[storeKey] = new Map(); // Map<nome_original, produto>
      produtosCacheNormalizado[storeKey] = []; // Array de {nome_original, nome_normalizado, produto}
      
      for (let i = 0; i < allData.length; i++) {
        const ean = String(allData[i][0] || '').trim(); // Coluna A (ProdutoID/EAN)
        const descricao = String(allData[i][1] || '').trim(); // Coluna B (Descrição)
        const localizacao = String(allData[i][2] || '').trim(); // Coluna C (LocalizacaoCorreta)
        
        if (!descricao) continue;
        
        // Filtra apenas produtos que têm endereço (não pode ser "sem endereco")
        const temEndereco = localizacao && 
                           localizacao.toLowerCase() !== 'sem endereco' && 
                           localizacao.toLowerCase() !== 'sem endereço' &&
                           localizacao.length > 0;
        
        if (!temEndereco) continue;
        
        // Evita duplicatas usando descrição como chave
        if (!produtosCache[storeKey].has(descricao)) {
          const nomeNormalizado = normalizarTextoParaBusca(descricao);
          const produto = {
            nome: descricao,
            product_code: '', // Será buscado depois se necessário
            ean: ean // Guarda o EAN para usar como barcode
          };
          
          produtosCache[storeKey].set(descricao, produto);
          
          // Adiciona ao índice normalizado para busca rápida
          produtosCacheNormalizado[storeKey].push({
            nomeOriginal: descricao,
            nomeNormalizado: nomeNormalizado,
            produto: produto
          });
        }
      }
      
      produtosCacheTimestamp[storeKey] = now;
      // Log removido para melhor performance
    }
    
    // Busca no cache normalizado (otimizada para máxima velocidade)
    const suggestions = [];
    const produtosEncontrados = new Set(); // Evita duplicatas
    
    // Busca flexível: verifica se o termo normalizado está contido no nome normalizado
    // Itera diretamente no array para máxima performance
    // Usa loop otimizado sem logs desnecessários
    const len = produtosCacheNormalizado[storeKey].length;
    for (let i = 0; i < len; i++) {
      const item = produtosCacheNormalizado[storeKey][i];
      
      // Busca flexível: verifica se o termo está contido (ignora acentos)
      // Usa includes() que é muito rápido em strings
      if (item.nomeNormalizado.includes(queryNormalizado)) {
        // Evita duplicatas
        if (!produtosEncontrados.has(item.nomeOriginal)) {
          // Guarda também o nome normalizado para ordenação rápida depois
          suggestions.push({
            nome: item.produto.nome,
            nomeNorm: item.nomeNormalizado, // Já calculado, não precisa recalcular
            product_code: item.produto.product_code || '',
            barcode: item.produto.ean || '' // Usa o EAN como barcode
          });
          produtosEncontrados.add(item.nomeOriginal);
        }
      }
    }
    
    // Ordena por relevância (produtos que começam com o termo primeiro)
    // Otimizado: usa nomes normalizados já guardados durante a busca
    suggestions.sort((a, b) => {
      const aStarts = a.nomeNorm.startsWith(queryNormalizado) ? 0 : 1;
      const bStarts = b.nomeNorm.startsWith(queryNormalizado) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.nome.localeCompare(b.nome);
    });
    
    // Remove propriedade temporária antes de retornar
    const finalSuggestions = suggestions.map(s => ({
      nome: s.nome,
      product_code: s.product_code,
      barcode: s.barcode
    }));
    
    // Retorna resultados (sem logs para melhor performance)
    return {status: 'ok', suggestions: finalSuggestions};
  } catch (e) {
    console.error('Erro ao buscar produtos por nome:', e);
    return {status: 'error', msg: e.message, suggestions: []};
  }
}

/** Busca o barcode na aba "Codigos de barras" pelo product_code (função pública)
 * Retorna o barcode (coluna D) correspondente ao product_code (coluna B)
 */
function getBarcodeByProductCode(storeName, productCode) {
  const barcode = getBarcodeByProductCode_(storeName, productCode);
  return {barcode: barcode || null};
}

/** Busca a descrição na aba "Codigos de barras" pelo product_code (função privada)
 * Retorna a descrição (coluna C) correspondente ao product_code (coluna B)
 */
function getDescricaoByProductCode_(storeName, productCode) {
  if (!productCode) return null;
  const index = getAddressingIndex_(storeName);
  const normalizedCode = normalizeProductCodeValue_(productCode);
  if (index.productCodeToDescription[normalizedCode]) {
    return index.productCodeToDescription[normalizedCode];
  }
  try {
    const sh = getCodigosBarrasSheetReadOnly_(storeName);
    if (!sh) return null;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;

    const codProdutoCol = 2; // Coluna B = product_code
    const rngCol = sh.getRange(2, codProdutoCol, lastRow - 1, 1);
    const found = rngCol.createTextFinder(String(productCode))
                        .matchEntireCell(true)
                        .findNext();
    if (!found) return null;

    const row = found.getRow();
    const desc = sh.getRange(row, 3).getValue(); // Coluna C = descrição
    const result = String(desc || '').trim();
    return result || null;
  } catch (e) {
    console.error('Erro ao buscar descrição por product_code:', e);
    return null;
  }
}

/** Busca o barcode na aba "Codigos de barras" pelo product_code (função privada)
 * Retorna o barcode (coluna D) correspondente ao product_code (coluna B)
 */
function getBarcodeByProductCode_(storeName, productCode) {
  if (!productCode) return null;
  const index = getAddressingIndex_(storeName);
  const normalizedCode = normalizeProductCodeValue_(productCode);
  if (index.productCodeToBarcode[normalizedCode]) {
    return index.productCodeToBarcode[normalizedCode];
  }
  
  try {
    const sh = getCodigosBarrasSheetReadOnly_(storeName);
    if (!sh) return null;
    
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;
    
    // Busca o product_code na coluna B (índice 2)
    const codProdutoCol = 2; // Coluna B = product_code
    const rngCol = sh.getRange(2, codProdutoCol, lastRow - 1, 1);
    const found = rngCol.createTextFinder(String(productCode))
                         .matchEntireCell(true)
                         .findNext();
    if (!found) return null;
    
    const row = found.getRow();
    // Retorna o barcode da coluna D (índice 4)
    const barcode = sh.getRange(row, 4).getValue();
    return String(barcode || '').trim() || null;
  } catch (e) {
    console.error('Erro ao buscar barcode por product_code:', e);
    return null;
  }
}

/** Busca o cod_produto da aba "Codigos de barras" pelo EAN/barcode
 * Estrutura conhecida:
 * - Coluna A: id_modelo
 * - Coluna B: cod_produto
 * - Coluna C: descrição
 * - Coluna D: barcode
 * - Coluna E: categoria
 * Procura o código de barras na coluna D e retorna o cod_produto da coluna B da mesma linha
 */
function getProductCodeByBarcode_(storeName, barcode) {
  if (!barcode) return null;
  const index = getAddressingIndex_(storeName);
  const barcodeNorm = normalizeBarcodeValue_(barcode);
  if (barcodeNorm && index.barcodeToProductCode[barcodeNorm]) {
    return index.barcodeToProductCode[barcodeNorm];
  }
  
  try {
    // Usa getSheetReadOnly_ para não criar a aba se ela não existir
    const sh = getCodigosBarrasSheetReadOnly_(storeName);
    if (!sh) {
      console.error('Aba "Codigos de barras" não encontrada');
      return null;
    }
    
    const last = sh.getLastRow();
    if (last < 2) return null;
    
    // Busca o barcode na coluna D (índice 4)
    const barcodeCol = 4; // Coluna D
    const codProdutoCol = 2; // Coluna B
    
    if (!barcodeNorm) return null;

    // Busca o barcode na coluna D, normalizando para lidar com zeros à esquerda
    const rngCol = sh.getRange(2, barcodeCol, last - 1, 1);
    const values = rngCol.getDisplayValues();
    let foundRow = -1;
    for (let i = 0; i < values.length; i++) {
      const cellNorm = normalizeBarcodeValue_(values[i][0]);
      if (cellNorm && cellNorm === barcodeNorm) {
        foundRow = i + 2;
        break;
      }
    }
    if (foundRow === -1) {
      console.error('Barcode não encontrado na aba "Codigos de barras":', barcode);
      return null;
    }

    const codProduto = sh.getRange(foundRow, codProdutoCol).getValue();
    const result = String(codProduto || '').trim();
    
    if (!result) {
      console.error('cod_produto vazio na linha', foundRow);
      return null;
    }
    
    return result;
  } catch (e) {
    console.error('Erro ao buscar cod_produto:', e);
    return null;
  }
}

function getCodigosBarrasSheetReadOnly_(storeName) {
  const names = [
    SHEET_CODIGOS_BARRAS,
    'Código de barras',
    'Códigos de barras',
    'Código de barras produtos',
    'Codigos de barras produtos'
  ];
  for (const name of names) {
    const sh = getConferenciaSheetReadOnly_(storeName, name);
    if (sh) return sh;
  }
  return null;
}

/** Parseia a localização no formato "LJ130001-R1-017-2A" 
 * Retorna {galpao, rua, estante, escaninho}
 * IMPORTANTE: estante SEMPRE deve ter 3 dígitos (ex: 001, 017, 123)
 */
function parsearLocalizacao(localizacao) {
  if (!localizacao) return {galpao: '', rua: '', estante: '000', escaninho: ''};
  
  const partes = String(localizacao).trim().split('-');
  let galpao = '';
  let rua = '';
  let estante = '000'; // Padrão
  let escaninho = '';
  
  if (partes.length >= 1) galpao = partes[0].trim();
  if (partes.length >= 2) rua = partes[1].trim();
  if (partes.length >= 3) {
    estante = partes[2].trim();
    // Garante que estante tenha SEMPRE 3 dígitos como TEXTO
    const estanteNum = parseInt(estante);
    if (!isNaN(estanteNum)) {
      estante = String(estanteNum).padStart(3, '0'); // Garante 3 dígitos como texto "005"
    } else {
      // Se não for número, tenta extrair números e formatar
      const numeros = estante.replace(/\D/g, '');
      if (numeros) {
        estante = String(parseInt(numeros)).padStart(3, '0'); // Garante 3 dígitos como texto
      } else {
        estante = '000'; // Padrão se não conseguir extrair número
      }
    }
  }
  if (partes.length >= 4) escaninho = partes[3].trim();
  
  console.log('parsearLocalizacao:', {localizacao, partes, estante});
  
  return {galpao, rua, estante, escaninho};
}

/** Busca quantidade e data de validade do inventário mais recente para um EAN
 * Retorna {quantidade, dataValidade} ou null se não encontrar
 */
function getInventarioRecente_(storeName, ean) {
  if (!ean) return null;
  const sh = getConferenciaSheet_(storeName, SHEET_INV);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  
  // Procura o EAN na coluna C (EAN)
  const rngColC = sh.getRange(2, 3, lastRow - 1, 1);
  const found = rngColC.createTextFinder(String(ean))
                       .matchEntireCell(true)
                       .findAll();
  
  if (!found || found.length === 0) return null;
  
  // Pega a linha mais recente (última encontrada)
  const rows = found.map(f => f.getRow()).sort((a, b) => b - a); // Ordena do mais recente
  const rowMaisRecente = rows[0];
  
  // Lê quantidade (coluna D = 4) e data_validade (coluna H = 8 após atualização do layout)
  const quantidade = sh.getRange(rowMaisRecente, 4).getValue();
  const dataValidade = sh.getRange(rowMaisRecente, 8).getValue();
  
  return {
    quantidade: quantidade ? parseInt(quantidade) : null,
    dataValidade: dataValidade ? String(dataValidade).trim() : null
  };
}

/** Salva ou atualiza registro na aba EstoqueKdabra
 * Se cod_produto + data_validade já existir, soma a quantidade
 * Caso contrário, cria nova linha
 */
// Função auxiliar para normalizar data para comparação (sempre retorna DD/MM/YYYY)
function normalizarDataParaComparacao(data) {
  if (!data) return '';
  
  let dataStr = '';
  
  // Se for Date object, converte para DD/MM/YYYY
  if (data instanceof Date) {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    dataStr = `${dia}/${mes}/${ano}`;
  } else {
    dataStr = String(data).trim();
  }
  
  // Remove espaços
  dataStr = dataStr.replace(/\s+/g, '');
  
  // Extrai apenas números
  const numeros = dataStr.replace(/\D/g, '');
  
  // Se tem 8 dígitos, formata como DD/MM/YYYY
  if (numeros.length === 8) {
    return numeros.slice(0, 2) + '/' + numeros.slice(2, 4) + '/' + numeros.slice(4);
  }
  
  // Se já tem formato DD/MM/YYYY, retorna normalizado
  if (dataStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dataStr;
  }
  
  return '';
}

function salvarEstoqueKdabra(storeName, codProduto, localizacao, quantidade, dataValidade) {
  if (!codProduto) return;
  
  const sh = getConferenciaSheet_(storeName, SHEET_ESTOQUE, HEAD_ESTOQUE);
  const parsed = parsearLocalizacao(localizacao);
  
  // Valores padrão
  const tipo = 'Ajuste';
  const justificativa = 'entrada de estoque';
  const destino = 'destino';
  const unidadeMedida = 'UN';
  
  // Normaliza cod_produto para comparação (remove espaços, converte para string)
  const codProdutoNormalizado = String(codProduto || '').trim();
  
  // Normaliza data de validade para salvar (formato DD/MM/YYYY)
  let dataValidadeParaSalvar = '';
  if (dataValidade) {
    const dataStr = String(dataValidade).trim();
    dataValidadeParaSalvar = dataStr.replace(/\s+/g, '');
    // Garante formato DD/MM/YYYY
    const numeros = dataValidadeParaSalvar.replace(/\D/g, '');
    if (numeros.length === 8) {
      dataValidadeParaSalvar = numeros.slice(0, 2) + '/' + numeros.slice(2, 4) + '/' + numeros.slice(4);
    }
  }
  
  // Normaliza data para comparação
  const dataValidadeNormalizada = normalizarDataParaComparacao(dataValidade);
  
  // Busca se já existe registro com mesmo cod_produto e data_validade
  const lastRow = sh.getLastRow();
  let linhaExistente = -1;
  let quantidadeExistente = 0;
  let bipagemExistente = 1;
  
  if (lastRow > 1) {
    // Lê todas as linhas de uma vez para melhor performance
    const dataRange = sh.getRange(2, 1, lastRow - 1, 11); // Todas as colunas
    const allData = dataRange.getValues();
    
    for (let i = 0; i < allData.length; i++) {
      // Normaliza cod_produto da linha (remove espaços, converte para string)
      const rowCodProduto = String(allData[i][0] || '').trim();
      
      // Normaliza data_validade da linha usando a mesma função
      const rowDataValidadeNormalizada = normalizarDataParaComparacao(allData[i][8]);
      
      // Compara cod_produto e data_validade (ambos normalizados)
      const codProdutoMatch = rowCodProduto === codProdutoNormalizado;
      const dataValidadeMatch = rowDataValidadeNormalizada === dataValidadeNormalizada;
      
      // Debug: log para verificar comparação
      if (codProdutoMatch) {
        console.log('Comparação:', {
          rowCodProduto,
          codProdutoNormalizado,
          matchCod: codProdutoMatch,
          rowDataValidade: String(allData[i][8] || ''),
          rowDataValidadeNormalizada,
          dataValidadeNormalizada,
          matchData: dataValidadeMatch,
          linha: i + 2
        });
      }
      
      if (codProdutoMatch && dataValidadeMatch) {
        linhaExistente = i + 2; // +2 porque começa na linha 2 e i é 0-based
        quantidadeExistente = parseInt(allData[i][6] || 0); // coluna quantidade
        console.log('Linha existente encontrada! Linha:', linhaExistente, 'Quantidade atual:', quantidadeExistente);
        break;
      }
    }
  }
  
  if (linhaExistente > 0) {
    // Atualiza quantidade existente (soma)
    const novaQuantidade = quantidadeExistente + (quantidade || 0);
    console.log('Atualizando linha existente:', linhaExistente, 'Quantidade:', quantidadeExistente, '+', quantidade, '=', novaQuantidade);
    sh.getRange(linhaExistente, 7).setValue(novaQuantidade); // coluna quantidade = 7
    // Garante que estante tenha 3 dígitos (caso tenha sido salva errada antes)
    sh.getRange(linhaExistente, 4).setNumberFormat('@');
    sh.getRange(linhaExistente, 4).setValue(parsed.estante);
  } else {
    // Cria nova linha
    console.log('Criando nova linha. Estante formatada:', parsed.estante);
    
    // Salva a linha
    const newRow = sh.getLastRow() + 1;
    sh.getRange(newRow, 1, 1, 11).setValues([[
      codProduto,
      parsed.galpao,
      parsed.rua,
      parsed.estante, // Já vem formatado como "005"
      parsed.escaninho,
      tipo,
      quantidade || 0,
      justificativa,
      dataValidadeParaSalvar,
      destino,
      unidadeMedida
    ]]);
    
    // FORÇA formato texto na coluna estante (coluna D = 4)
    sh.getRange(newRow, 4).setNumberFormat('@');
    // Salva novamente como texto para garantir
    sh.getRange(newRow, 4).setValue(parsed.estante);
  }
}

// ===== endereçamento =====
function startAddressing(storeName, barcode) {
  const prod = getLocalByBarcode_(storeName, barcode);
  if (!prod) return {status:'not_found', msg:'Produto não cadastrado.'};
  if (!prod.localCorreto || !prod.locaisCompletos || prod.locaisCompletos.length === 0) {
    return {status:'no_location', msg:'Produto sem localização cadastrada.'};
  }
  if (shouldIgnoreAddressing_(storeName, prod.locaisCompletos, null)) {
    const atual = getCurrentAddressByBarcode_(storeName, barcode);
    return {
      status: 'ready',
      localCorreto: (atual && atual.localCorreto) ? atual.localCorreto : prod.localCorreto,
      locaisCompletos: (atual && atual.locaisCompletos && atual.locaisCompletos.length) ? atual.locaisCompletos : prod.locaisCompletos,
      codProduto: prod.codProduto || getProductCodeByBarcode_(storeName, barcode) || '',
      descricao: prod.descricao || ((getDescricaoByEan_(storeName, barcode) || {}).descricao || ''),
      blocked: true
    };
  }
  return {
    status:'ready',
    localCorreto: prod.localCorreto,
    locaisCompletos: prod.locaisCompletos,
    codProduto: prod.codProduto || getProductCodeByBarcode_(storeName, barcode) || '',
    descricao: prod.descricao || ((getDescricaoByEan_(storeName, barcode) || {}).descricao || '')
  };
}

function finalizeAddressing(storeName, barcode, localBipado, operador, quantidade, dataValidade) {
  if (!operador) return {status:'no_operator', msg:'Bipe o crachá para iniciar.'};

  const prod = getLocalByBarcode_(storeName, barcode);
  if (!prod) return {status:'not_found', msg:'Produto não cadastrado.'};
  if (!prod.localCorreto || !prod.locaisCompletos || prod.locaisCompletos.length === 0) {
    return {status:'no_location', msg:'Produto sem localização cadastrada.'};
  }

  const lido = String(localBipado||'').trim().toUpperCase();
  if (shouldIgnoreAddressing_(storeName, prod.locaisCompletos, lido)) {
    const atual = getCurrentAddressByBarcode_(storeName, barcode);
    return {
      status: 'addr_ok',
      msg: 'Endereço bloqueado. Manter no local cadastrado.',
      localCorreto: (atual && atual.localCorreto) ? atual.localCorreto : prod.localCorreto,
      locaisCompletos: (atual && atual.locaisCompletos && atual.locaisCompletos.length) ? atual.locaisCompletos : prod.locaisCompletos,
      blocked: true
    };
  }

  // Valida quantidade e data de validade (obrigatórios)
  if (!quantidade || quantidade < 1) {
    return {status:'error', msg:'Quantidade é obrigatória e deve ser maior que zero.'};
  }
  if (!dataValidade || String(dataValidade).trim().length < 10) {
    return {status:'error', msg:'Data de validade é obrigatória (formato DD/MM/AAAA).'};
  }

  // Verifica se o local bipado corresponde a alguma das localizações cadastradas
  const ok = prod.locaisCompletos.some(loc => loc.toUpperCase() === lido);

  // Busca cod_produto para salvar na coluna ProdutoID
  const codProduto = prod.codProduto || getProductCodeByBarcode_(storeName, barcode) || barcode; // Se não encontrar, usa o barcode como fallback
  const produtoNome = prod.descricao || (getDescricaoByEan_(storeName, barcode) || {}).descricao || getDescricaoByProductCode_(storeName, codProduto) || '';

  const addrInfo = ensureEnderecoHeaders_(storeName);
  const sh = addrInfo && addrInfo.sheet ? addrInfo.sheet : getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (addrInfo && addrInfo.inserted) {
    backfillEnderecoProdutoNome_(storeName, sh, addrInfo.colProdutoId, addrInfo.colProdutoNome);
  }

  const dt = formatDateTimeBR();
  sh.appendRow([dt.data, dt.hora, String(operador), codProduto, produtoNome, prod.localCorreto, lido, ok ? 'EndereçadoOK' : 'EndereçadoErro']);

  // Se EndereçadoOK, grava também na aba Subir
  if (ok) {
    try {
      appendSubirRow_(storeName, codProduto, lido);
    } catch (e) {
      console.error('Erro ao salvar na aba Subir:', e);
    }
  }

  // Se o resultado for EndereçadoOK, salva também na aba EstoqueKdabra
  if (ok) {
    try {
      // Garante que a aba EstoqueKdabra existe (cria se não existir)
      getConferenciaSheet_(storeName, SHEET_ESTOQUE, HEAD_ESTOQUE);
      
      // Usa o cod_produto já buscado anteriormente (ou busca novamente se necessário)
      const codProdutoParaEstoque = prod.codProduto || getProductCodeByBarcode_(storeName, barcode);
      
      if (!codProdutoParaEstoque) {
        // Se não encontrou cod_produto, não salva na EstoqueKdabra
        // O cod_produto é obrigatório
        console.error('cod_produto não encontrado para barcode:', barcode);
        // Continua o fluxo normalmente, mas não salva na EstoqueKdabra
      } else {
        // Usa quantidade e data de validade fornecidas pelo usuário
        const qty = parseInt(quantidade);
        const validade = String(dataValidade).trim();
        
        // Salva na EstoqueKdabra usando a localização bipada
        salvarEstoqueKdabra(storeName, codProdutoParaEstoque, lido, qty, validade);
      }
    } catch (e) {
      // Se houver erro ao salvar na EstoqueKdabra, não interrompe o fluxo
      // Apenas registra o erro silenciosamente
      console.error('Erro ao salvar na EstoqueKdabra:', e);
      console.error('Stack trace:', e.stack);
    }
  }

  return ok
    ? {status:'addr_ok', msg:'✅ Endereçamento confirmado.'}
    : {status:'addr_mismatch', msg:`❌ Endereço divergente. Cadastrado: ${prod.localCorreto}`};
}

function finalizeAddressingSemEstoque(storeName, barcode, localBipado, operador) {
  if (!operador) return {status:'no_operator', msg:'Bipe o crachá para iniciar.'};

  const prod = getLocalByBarcode_(storeName, barcode);
  if (!prod) return {status:'not_found', msg:'Produto não cadastrado.'};
  if (!prod.localCorreto || !prod.locaisCompletos || prod.locaisCompletos.length === 0) {
    return {status:'no_location', msg:'Produto sem localização cadastrada.'};
  }

  const lido = String(localBipado||'').trim().toUpperCase();
  if (shouldIgnoreAddressing_(storeName, prod.locaisCompletos, lido)) {
    const atual = getCurrentAddressByBarcode_(storeName, barcode);
    return {
      status: 'addr_ok',
      msg: 'Endereço bloqueado. Manter no local cadastrado.',
      localCorreto: (atual && atual.localCorreto) ? atual.localCorreto : prod.localCorreto,
      locaisCompletos: (atual && atual.locaisCompletos && atual.locaisCompletos.length) ? atual.locaisCompletos : prod.locaisCompletos,
      blocked: true
    };
  }
  const ok = prod.locaisCompletos.some(loc => loc.toUpperCase() === lido);

  const codProduto = prod.codProduto || getProductCodeByBarcode_(storeName, barcode) || barcode;
  const produtoNome = prod.descricao || (getDescricaoByEan_(storeName, barcode) || {}).descricao || getDescricaoByProductCode_(storeName, codProduto) || '';

  const addrInfo = ensureEnderecoHeaders_(storeName);
  const sh = addrInfo && addrInfo.sheet ? addrInfo.sheet : getConferenciaSheet_(storeName, SHEET_ADDR, HEAD_ADDR);
  if (addrInfo && addrInfo.inserted) {
    backfillEnderecoProdutoNome_(storeName, sh, addrInfo.colProdutoId, addrInfo.colProdutoNome);
  }

  const dt = formatDateTimeBR();
  sh.appendRow([dt.data, dt.hora, String(operador), codProduto, produtoNome, prod.localCorreto, lido, ok ? 'EndereçadoOK' : 'EndereçadoErro']);

  // Se EndereçadoOK, grava também na aba Subir
  if (ok) {
    try {
      appendSubirRow_(storeName, codProduto, lido);
    } catch (e) {
      console.error('Erro ao salvar na aba Subir:', e);
    }
  }

  return ok
    ? {status:'addr_ok', msg:'✅ Endereçamento confirmado.'}
    : {status:'addr_mismatch', msg:`❌ Endereço divergente. Cadastrado: ${prod.localCorreto}`};
}

// ===== inventário =====
function fetchProductByEan(storeName, ean) {
  if (!ean) return {status:'error', msg:'EAN não informado.'};
  const prod = getDescricaoByEan_(storeName, ean);
  if (!prod) return {status:'not_found', msg:'Produto não encontrado na base de dados.'};
  return {status:'found', descricao: prod.descricao};
}

function saveInventario(storeName, ean, quantidade, descricao, operador, dataValidade) {
  if (!operador) return {status:'no_operator', msg:'Bipe o crachá para iniciar.'};
  if (!ean) return {status:'error', msg:'EAN não informado.'};
  const qty = parseInt(quantidade, 10);
  if (!qty || qty < 1) return {status:'error', msg:'Quantidade inválida.'};
  // Valida data de validade (obrigatória)
  if (!dataValidade || String(dataValidade).trim().length < 10) {
    return {status:'error', msg:'Data de validade é obrigatória (formato DD/MM/AAAA).'};
  }

  const sh = getConferenciaSheet_(storeName, SHEET_INV, HEAD_INV);
  const dt = formatDateTimeBR();

  // Normaliza data de validade para comparação e salvamento
  const validadeNormalizada = normalizarDataParaComparacao(dataValidade);
  const validadeParaSalvar = validadeNormalizada;

  // Busca informações auxiliares
  const codProduto = getProductCodeByBarcode_(storeName, ean) || '';
  const localInfo = getLocalByBarcode_(storeName, ean);
  let rua = '';
  let estante = '000';
  let escaninho = '';

  if (localInfo && localInfo.locaisCompletos && localInfo.locaisCompletos.length > 0) {
    const parsed = parsearLocalizacao(localInfo.locaisCompletos[0]);
    rua = parsed.rua || '';
    estante = parsed.estante || '000';
    escaninho = parsed.escaninho || '';
  }

  const lastRow = sh.getLastRow();
  let bipagemN = 1;
  let linhaExistente = -1;
  let quantidadeExistente = 0;

  if (lastRow > 1) {
    const dataRange = sh.getRange(2, 1, lastRow - 1, HEAD_INV.length).getValues();
    let maxBip = 0;
    for (let i = 0; i < dataRange.length; i++) {
      const row = dataRange[i];
      const rowEan = String(row[2] || '').trim();
      if (rowEan !== String(ean)) continue;

      const rowBip = parseInt(row[5] || 0, 10);
      if (rowBip > maxBip) maxBip = rowBip;

      const rowDataNorm = normalizarDataParaComparacao(row[7]);
      if (rowDataNorm === validadeNormalizada) {
        linhaExistente = i + 2; // +2 pois dataRange começa na linha 2
        quantidadeExistente = parseInt(row[3] || 0, 10) || 0;
        bipagemExistente = rowBip || 1;
      }
    }
    bipagemN = maxBip + 1;
  }

  if (linhaExistente > 0) {
    const novaQuantidade = quantidadeExistente + qty;
    sh.getRange(linhaExistente, 1, 1, HEAD_INV.length).setValues([[
      dt.data, // Atualiza data para registro da última bipagem
      dt.hora,
      String(ean),
      novaQuantidade,
      String(descricao || ''),
      bipagemExistente,
      String(operador),
      validadeParaSalvar,
      rua,
      estante,
      escaninho,
      codProduto
    ]]);
    sh.getRange(linhaExistente, 10).setNumberFormat('@');
    sh.getRange(linhaExistente, 10).setValue(estante);

    return {status:'saved', msg:`✅ Quantidade atualizada para ${novaQuantidade} (mesma validade).`};
  }

  const newRow = sh.getLastRow() + 1;
  sh.getRange(newRow, 1, 1, HEAD_INV.length).setValues([[
    dt.data,
    dt.hora,
    String(ean),
    qty,
    String(descricao || ''),
    bipagemN,
    String(operador),
    validadeParaSalvar,
    rua,
    estante,
    escaninho,
    codProduto
  ]]);
  sh.getRange(newRow, 10).setNumberFormat('@');
  sh.getRange(newRow, 10).setValue(estante);

  return {status:'saved', msg:`✅ Inventário salvo! Bipagem N: ${bipagemN}`};
}
