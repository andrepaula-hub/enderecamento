/**
 * @OnlyCurrentDoc <-- REMOVA ESTA LINHA (ou apague o comentário inteiro)
 *
 * ORBITA - Backend do Dashboard de Reendereçamento V2.8.0 (Painel de Métricas e Relatórios)
 * NOVO 1: Painel de Métricas (Cálculo de ocupação, SKUs, volumes)
 * NOVO 2: Melhorias Visuais (Transparência por ocupação, Tooltip com Categoria de Armazenagem)
 * NOVO 3: Função 'generateSkuReport' para exportar relatório de SKUs.
 * MANTÉM: V2.7.3 - Lógica de Criação, Remoção e Troca de Equipamento.
 */

// --- CONFIGURAÇÃO GLOBAL DAS ABAS ---
const NOME_ABA_PLANO_FINAL = "Plano_Enderecamento_Final";
const NOME_ABA_LOG_FALHAS = "Log_Alocacao_Detalhado";
const NOME_ABA_BASE_PRODUTOS = "Base_Produtos";
const NOME_ABA_DIC_CATEGORIAS = "Dicionario_Categorias";
const NOME_ABA_REGRAS_RUAS = "Regras_Ruas";
const NOME_ABA_LOG_REEND = "Log_Reenderecamento";
const NOME_ABA_VOLUMETRIA = "Volumetria_Equipamentos";
const NOME_ABA_CADASTRO_EQUIP = "Cadastro_Equipamentos";
const NOME_ABA_CONFIG_OPER = "Configuracoes_Operacionais";
const NOME_ABA_BARCODE = "Código de barras produtos";
const VERSAO_PREFIX = "VERSAO_ENDERECAMENTO__";

// --- CACHE ---
const SCRIPT_CACHE = CacheService.getScriptCache();
const CACHE_TIMEOUT_SECONDS = 60 * 30; // 30 minutos

// --- CONFIGURAÇÃO DE LOGS ---
// Desabilita logs verbosos de classificação de produtos (evita travamento)
const ENABLE_VERBOSE_PRODUCT_LOGS = false; // NUNCA ATIVAR - gera milhares de linhas e trava o PC

// Variável global para controlar logs durante testes
var IS_TESTING_MODE = false; // Quando true, suprime logs verbosos

// Constantes para locais virtuais
const PRANCHETA_ID = 'PRANCHETA';
const UNALLOCATED_ID = 'UNALLOCATED';
const LOG_UNALLOCATED_LABEL = 'NÃO ALOCADO'; // Label para o log
const LOG_DELETADO_LABEL = 'DELETADO'; // Label para o log
const LOG_DATE_FORMAT = "dd/MM/yyyy";
const LOG_TIME_FORMAT = "HH:mm:ss";

function _normalizeLogHeader(header) {
  return String(header || '').toLowerCase().trim().replace(/\s+/g, '_');
}

function _parseBooleanFlag(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'true' || normalized === 'sim' || normalized === 'yes' || normalized === 'y' || normalized === '1';
}

function _ensureLogDateTimeColumns(logSheet) {
  const lastCol = Math.max(logSheet.getLastColumn(), 1);
  const headerRange = logSheet.getRange(1, 1, 1, lastCol);
  const headers = headerRange.getValues()[0].map(h => String(h || '').trim());
  const normalized = headers.map(_normalizeLogHeader);

  const idxDataMov = normalized.indexOf('data_movimentacao');
  const idxData = normalized.indexOf('data');
  const idxHora = normalized.indexOf('hora');

  if (idxData !== -1 && idxHora !== -1) {
    return headers;
  }

  if (idxDataMov !== -1) {
    headers[idxDataMov] = 'data';
    logSheet.getRange(1, idxDataMov + 1).setValue('data');
    if (idxHora === -1) {
      logSheet.insertColumnAfter(idxDataMov + 1);
      logSheet.getRange(1, idxDataMov + 2).setValue('hora');
      headers.splice(idxDataMov + 1, 0, 'hora');
    }
    return headers;
  }

  const insertAfter = logSheet.getLastColumn();
  logSheet.insertColumnsAfter(insertAfter, 2);
  logSheet.getRange(1, insertAfter + 1, 1, 2).setValues([['data', 'hora']]);
  headers.push('data', 'hora');
  return headers;
}

function _buildLogRowFromHeaders(headers, entry) {
  const row = new Array(headers.length).fill('');
  const dataHora = `${entry.data || ''}${entry.hora ? ' ' + entry.hora : ''}`.trim();

  headers.forEach((h, idx) => {
    const key = _normalizeLogHeader(h);
    switch (key) {
      case 'product_code':
      case 'codigo_produto':
      case 'produto':
        row[idx] = entry.product_code || '';
        break;
      case 'location_id_anterior':
      case 'loc_anterior':
      case 'origem':
        row[idx] = entry.location_id_anterior || '';
        break;
      case 'location_id_novo':
      case 'loc_novo':
      case 'destino':
        row[idx] = entry.location_id_novo || '';
        break;
      case 'data':
        row[idx] = entry.data || '';
        break;
      case 'hora':
        row[idx] = entry.hora || '';
        break;
      case 'data_movimentacao':
        row[idx] = dataHora;
        break;
      case 'motivo':
      case 'acao':
        row[idx] = entry.motivo || '';
        break;
      case 'usuario':
      case 'user':
      case 'email':
        row[idx] = entry.usuario || '';
        break;
      default:
        break;
    }
  });

  return row;
}

function _getLogDateTime(timeZone) {
  const tz = timeZone || "America/Sao_Paulo";
  const now = new Date();
  return {
    data: Utilities.formatDate(now, tz, LOG_DATE_FORMAT),
    hora: Utilities.formatDate(now, tz, LOG_TIME_FORMAT)
  };
}

function appendLogEntries(logSheet, entries, timeZone) {
  if (!logSheet || !entries || entries.length === 0) return;
  const headers = _ensureLogDateTimeColumns(logSheet);
  const rows = entries.map(entry => _buildLogRowFromHeaders(headers, entry));
  const startRow = logSheet.getLastRow() + 1;
  logSheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
}


/**
 * SERVE A APLICAÇÃO WEB
 */
function doGet(e) {
  Logger.log("Recebida solicitação GET. Servindo o Dashboard.html V2.8...");
  const html = HtmlService.createTemplateFromFile('Dashboard').evaluate();
  html.setTitle("ORBITA - Dashboard de Reendereçamento (V2.8)");
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

/**
 * OBTÉM MAPA DO DICIONÁRIO DE CATEGORIAS (CACHEADO)
 */
function getDicCatMap() {
  const cacheKey = 'dic_cat_map_v2.3.19';
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) { return JSON.parse(cached); }
  if (!IS_TESTING_MODE) Logger.log("Buscando Dic_Categorias (sem cache)...");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOME_ABA_DIC_CATEGORIAS);
    if (!sheet) throw new Error(`Aba "${NOME_ABA_DIC_CATEGORIAS}" não encontrada.`);
    const dicCatData = getSheetDataAsObjects(sheet);
    const dicCatMap = {};
    dicCatData.forEach(row => {
      if (!row.categoria_site) return;
      const key = String(row.categoria_site).toLowerCase().trim();
      const grupo = String(row.grupo || '').toLowerCase().trim();
      if (key) dicCatMap[key] = grupo;
    });
    if (Object.keys(dicCatMap).length > 0) { SCRIPT_CACHE.put(cacheKey, JSON.stringify(dicCatMap), CACHE_TIMEOUT_SECONDS); }
    return dicCatMap;
  } catch (e) {
      Logger.log(`Erro em getDicCatMap: ${e.message}`);
      return {};
  }
}

/**
 * OBTÉM MAPA DE CÓDIGO DE BARRAS PARA CÓDIGO DE PRODUTO (CACHEADO)
 */
function getBarcodeMap() {
  const cacheKey = 'barcode_map_v2.8';
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) { 
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log(`Erro ao parsear cache de barcode_map: ${e.message}`);
    }
  }
  
  Logger.log("Buscando mapeamento de código de barras (sem cache)...");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Código de barras produtos');
    
    if (!sheet) {
      Logger.log('Aba "Código de barras produtos" não encontrada');
      return {};
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      Logger.log('Aba "Código de barras produtos" está vazia ou sem dados');
      return {};
    }
    
    const headers = data[0];
    const barcodeIndex = headers.indexOf('barcode');
    const codProdutoIndex = headers.indexOf('cod_produto');
    
    if (barcodeIndex === -1 || codProdutoIndex === -1) {
      Logger.log('Colunas não encontradas: barcode ou cod_produto');
      return {};
    }
    
    const barcodeMap = {};
    
    // Itera pelas linhas (pula o cabeçalho)
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var barcode = String(row[barcodeIndex] || '').trim();
      var codProduto = String(row[codProdutoIndex] || '').trim();
      
      // Valida: barcode não pode ser vazio, não pode ser igual ao cod_produto, e deve ter pelo menos 8 caracteres numéricos
      if (barcode && codProduto && barcode !== codProduto && barcode.length >= 8 && /^\d+$/.test(barcode)) {
        // Se já existe, mantém o primeiro (ou pode usar uma lista se houver múltiplos)
        if (!barcodeMap[barcode]) {
          barcodeMap[barcode] = codProduto;
        }
      }
    }
    
    if (!IS_TESTING_MODE) Logger.log('Mapeamento de código de barras carregado: ' + Object.keys(barcodeMap).length + ' códigos');
    
    // Cacheia o resultado
    if (Object.keys(barcodeMap).length > 0) {
      try {
        const mapString = JSON.stringify(barcodeMap);
        if (mapString.length < 100000) { // Limite do cache
          SCRIPT_CACHE.put(cacheKey, mapString, CACHE_TIMEOUT_SECONDS);
        } else {
          Logger.log(`AVISO: Mapa de código de barras (${mapString.length} bytes) muito grande para cache. Será gerado a cada execução.`);
        }
      } catch (e) {
        Logger.log(`Erro ao salvar barcode_map no cache: ${e.message}`);
      }
    }
    
    return barcodeMap;
    
  } catch (error) {
    Logger.log('Erro ao carregar mapeamento de código de barras: ' + error.toString());
    return {};
  }
}

/**
 * BUSCA OS DADOS INICIAIS PARA CONSTRUIR O DASHBOARD
 */
function getInitialData() {
  if (!IS_TESTING_MODE) Logger.log("Iniciando getInitialData() V5 (Métricas)...");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Força flush para garantir que dados escritos estejam disponíveis
    SpreadsheetApp.flush();
    
    const dicCatMap = getDicCatMap(); 

    const getDataOrEmpty = (sheetName) => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
            if (!IS_TESTING_MODE) Logger.log(`AVISO: Aba "${sheetName}" não encontrada. Retornando array vazio.`);
            return [];
        }
        // Força leitura fresca dos dados (sem cache)
        return getSheetDataAsObjects(sheet);
    };

    if (!IS_TESTING_MODE) Logger.log("Lendo Base_Produtos (dados frescos)...");
    const baseProdutosData = getDataOrEmpty(NOME_ABA_BASE_PRODUTOS);
    if (!IS_TESTING_MODE) Logger.log(`Lidos ${baseProdutosData.length} produtos da Base_Produtos.`);
    
    // Log dos últimos produtos cadastrados para debug (apenas em modo não-teste)
    if (!IS_TESTING_MODE && baseProdutosData.length > 0) {
      const ultimosProdutos = baseProdutosData.slice(-5).map(p => p.product_code);
      Logger.log(`Últimos 5 códigos de produtos na Base: ${ultimosProdutos.join(', ')}`);
    }
    const planoFinalData = getDataOrEmpty(NOME_ABA_PLANO_FINAL);
    const logFalhasData = getDataOrEmpty(NOME_ABA_LOG_FALHAS);
    const regrasRuasData = getDataOrEmpty(NOME_ABA_REGRAS_RUAS);
    
    // Ler configurações operacionais para limites de alto/pesado
    const configOperData = getDataOrEmpty(NOME_ABA_CONFIG_OPER);
    let limiteAltura = null;
    let limitePeso = null;
    if (configOperData.length > 0) {
      // Procura pelos limites na estrutura parametro/valor
      configOperData.forEach(row => {
        const parametro = String(row.parametro || '').toLowerCase().trim();
        const valor = row.valor || row.value;
        
        // Verifica especificamente limite_altura_cm (não limite_altura_cm_baixo)
        if (parametro === 'limite_altura_cm' || parametro === 'limite altura cm' || 
            (parametro.includes('altura') && !parametro.includes('baixo') && !parametro.includes('baixa'))) {
          const alturaVal = parseFloat(String(valor || 0).replace(',', '.'));
          if (!isNaN(alturaVal) && alturaVal > 0) {
            limiteAltura = alturaVal;
          }
        }
        // Verifica especificamente limite_peso_kg
        if (parametro === 'limite_peso_kg' || parametro === 'limite peso kg' || 
            (parametro.includes('peso') && !parametro.includes('total'))) {
          const pesoVal = parseFloat(String(valor || 0).replace(',', '.'));
          if (!isNaN(pesoVal) && pesoVal > 0) {
            limitePeso = pesoVal;
          }
        }
      });
      
      // Se não encontrou na estrutura parametro/valor, tenta ler diretamente das colunas
      if (limiteAltura === null || limitePeso === null) {
        const configRow = configOperData[0];
        if (limiteAltura === null) {
          limiteAltura = parseFloat(String(configRow.limite_altura_cm || configRow.limite_altura || 0).replace(',', '.')) || null;
        }
        if (limitePeso === null) {
          limitePeso = parseFloat(String(configRow.limite_peso_kg || configRow.limite_peso || 0).replace(',', '.')) || null;
        }
      }
      
      Logger.log(`Limites carregados: Altura=${limiteAltura}cm, Peso=${limitePeso}kg`);
    }
    
    // Ler limite_altura_cm_baixo para produtos pequenos
    let limiteAlturaBaixo = null;
    configOperData.forEach(row => {
      const parametro = String(row.parametro || '').toLowerCase().trim();
      const valor = row.valor;
      if (parametro === 'limite_altura_cm_baixo' || parametro === 'limite_altura_baixo') {
        const alturaBaixoVal = parseFloat(String(valor || 0).replace(',', '.'));
        if (!isNaN(alturaBaixoVal) && alturaBaixoVal > 0) {
          limiteAlturaBaixo = alturaBaixoVal;
        }
      }
    });
    
    // Se não encontrou na estrutura parametro/valor, tenta ler diretamente das colunas
    if (limiteAlturaBaixo === null) {
      const configRow = configOperData[0];
      limiteAlturaBaixo = parseFloat(String(configRow.limite_altura_cm_baixo || configRow.limite_altura_baixo || 0).replace(',', '.')) || null;
    }
    
    Logger.log(`Limite altura baixo carregado: ${limiteAlturaBaixo}cm`);
    
    // Valores padrão se não encontrou na planilha
    if (limiteAltura === null) {
      limiteAltura = 28; // Valor padrão
      Logger.log(`Usando valor padrão para limite_altura_cm: ${limiteAltura}cm`);
    }
    if (limitePeso === null) {
      limitePeso = 0.5; // Valor padrão
      Logger.log(`Usando valor padrão para limite_peso_kg: ${limitePeso}kg`);
    }
    if (limiteAlturaBaixo === null) {
      limiteAlturaBaixo = 12.5; // Valor padrão
      Logger.log(`Usando valor padrão para limite_altura_cm_baixo: ${limiteAlturaBaixo}cm`);
    }
    
    const volumetriaData = getDataOrEmpty(NOME_ABA_VOLUMETRIA);
    const equipTypesList = [...new Set(volumetriaData.map(row => String(row.tipo_equipamento || '').trim()).filter(t => t && t.toLowerCase() !== 'tipo_equipamento'))];
    if (!IS_TESTING_MODE) Logger.log(`Encontrados ${equipTypesList.length} tipos de equipamento na Volumetria.`);


    // Função auxiliar para calcular is_alto e is_pequeno baseado nos limites
    // IMPORTANTE: NÃO ADICIONAR LOGS INDIVIDUAIS AQUI! Isso gera milhares de linhas e trava o PC.
    // Use apenas o resumo ao final do processamento.
    const calcularAltoPesadoPequeno = (productRow) => {
      let isAlto = false;
      let isPequeno = false;
      
      if (limiteAltura !== null) {
        const altura = parseFloat(String(productRow.altura_cm || 0).replace(',', '.')) || 0;
        isAlto = altura >= limiteAltura; // >= para incluir produtos com altura igual ao limite
        // NÃO LOGAR AQUI - apenas calcular
      }
      
      if (limiteAlturaBaixo !== null) {
        const altura = parseFloat(String(productRow.altura_cm || 0).replace(',', '.')) || 0;
        isPequeno = altura <= limiteAlturaBaixo;
        // NÃO LOGAR AQUI - apenas calcular
      }
      
      const isPesado = _parseBooleanFlag(productRow.is_pesado);
      return { is_alto: isAlto, is_pesado: isPesado, is_pequeno: isPequeno };
    };

    const baseProdutosMap = {};
    let contadorAltos = 0;
    let contadorPesados = 0;
    let contadorPequenos = 0;
    
    baseProdutosData.forEach(row => {
        const catSite = String(row.categoria_site || '').toLowerCase().trim();
        row.grupo = String(dicCatMap[catSite] || 'neutro').toLowerCase().trim(); 
        
        // Calcular is_alto e is_pequeno com limites; is_pesado vem da Base_Produtos
        const altoPesadoPequeno = calcularAltoPesadoPequeno(row);
        row.is_alto = altoPesadoPequeno.is_alto;
        row.is_pesado = altoPesadoPequeno.is_pesado;
        row.is_pequeno = altoPesadoPequeno.is_pequeno;
        
        // Contar produtos altos, pesados e pequenos
        if (altoPesadoPequeno.is_alto) contadorAltos++;
        if (altoPesadoPequeno.is_pesado) contadorPesados++;
        if (altoPesadoPequeno.is_pequeno) contadorPequenos++;
        
        // Ler is_fragil e degelo da Base_Produtos
        row.is_fragil = String(row.is_fragil || '').toUpperCase().trim();
        row.degelo = String(row.degelo || '').toUpperCase().trim();

        // Regra: Geladeira + degelo PODE => escaninhos_necessarios max 4
        const catArm = String(row.categoria_armazenagem || '').trim().toLowerCase();
        if (catArm === 'geladeira' && row.degelo === 'PODE') {
          const escRaw = String(row.escaninhos_necessarios || '').replace(',', '.');
          const escNum = parseInt(escRaw, 10);
          if (!isNaN(escNum) && escNum > 4) row.escaninhos_necessarios = 4;
        }
        
        if(row.product_code) {
          const normalizedCode = String(row.product_code).trim();
          if(normalizedCode) baseProdutosMap[normalizedCode] = row;
        }
      });
    Logger.log(`Mapa da Base_Produtos criado com ${Object.keys(baseProdutosMap).length} itens.`);
    Logger.log(`Classificação de produtos: ${contadorAltos} altos, ${contadorPesados} pesados, ${contadorPequenos} pequenos.`);

    const mapaCurvaRua = {};
    regrasRuasData.forEach(row => { if(row.rua_num) mapaCurvaRua[row.rua_num] = row.curva_designada; });
    const corMapGrupo = { 'alimento': '#1e8449', 'flv': '#2ecc71', 'bebidas': '#1abc9c', 'quimico': '#e74c3c', 'perfumaria': '#85c1e9', 'neutro': '#95a5a6', 'Vazio': '#ecf0f1', default: '#bdc3c7'};
    const corMapEquip = { 'prateleira': '#95a5a6', 'geladeira': '#5dade2', 'geladeira_alta': '#85C1E9', 'geladeira_americana': '#3498db', 'freezer': '#1A5276', 'prateleira lateral': '#34495e', default: '#7f8c8d'};

    // =================================================================
    // INÍCIO: Alteração V2.8 (Tooltip)
    // =================================================================
    function criarInfoHover(row) {
        if (!row || row.product_code === 'Vazio' || !row.product_code) { return "<b>Escaninho Vazio</b>"; }
        const productData = baseProdutosMap[String(row.product_code || '').trim()] || {}; 
        const rowData = row || {};
        const cat_armz = productData.categoria_armazenagem || rowData.categoria_armazenagem || 'N/A';
        const nome_produto_seguro = escapeHtml(productData.product_name || rowData.product_name || '');
        let fabricante = escapeHtml(productData.nm_fabricante || rowData.nm_fabricante || 'N/A');
        const subcategoria = escapeHtml(productData.subcategoria || rowData.subcategoria || 'N/A');
        let curvaOriginal = productData.curva || rowData.curva || '';
        let marcaOriginal = productData.nm_fabricante || rowData.nm_fabricante || '';
        let curvaFinal = 'N/A';
        if (curvaOriginal && isNaN(curvaOriginal) && String(curvaOriginal).length === 1) { curvaFinal = String(curvaOriginal).toUpperCase(); }
        else if (marcaOriginal && isNaN(marcaOriginal) && String(marcaOriginal).length === 1 && !isNaN(curvaOriginal)) { curvaFinal = String(marcaOriginal).toUpperCase(); fabricante = `[${fabricante}]`; }
        else if (curvaOriginal) { curvaFinal = String(curvaOriginal); }
        const quantidadeOriginal = productData.quantidade || rowData.quantidade;
        const quantidade = !isNaN(quantidadeOriginal) ? parseInt(quantidadeOriginal) : 0;
        const altura_val = productData.altura_cm || rowData.altura_cm || 0;
        const peso_val = productData.peso_kg_unitario || rowData.peso_kg_unitario || 0;
        const venda_val = productData.venda_total || rowData.venda_total || 0;
        const altura = (altura_val && altura_val !== 'Vazio') ? `${parseFloat(altura_val)} cm` : 'N/A';
        const peso = (peso_val && peso_val !== 'Vazio') ? `${parseFloat(peso_val)} kg` : 'N/A';
        const vendas = (venda_val && !isNaN(venda_val)) ? `${parseFloat(venda_val)}` : 'N/A';
        
        const degelo = String(productData.degelo || rowData.degelo || '').toUpperCase().trim();
        const degeloText = degelo === 'NAO' ? '⚡ Degelo = NÃO' : (degelo === 'PODE' ? 'Degelo = PODE' : 'N/A');
        
        return (`<b>Produto:</b> ${nome_produto_seguro}<br>` +
                `<b>Armazenagem:</b> ${cat_armz}<br>` + // <-- NOVO
                `<b>Subcategoria:</b> ${subcategoria}<br>` +
                `<b>Marca:</b> ${fabricante}<br>` +
                `<b>Código:</b> ${rowData.product_code || ''}<br>` +
                `<b>Curva:</b> ${curvaFinal}<br>` +
                `<b>Vendas:</b> ${vendas}<br>` +
                `<b>Altura:</b> ${altura}<br><b>Peso:</b> ${peso}<br>` +
                `<b>Quantidade:</b> ${quantidade}<br>` +
                `<b>Degelo:</b> ${degeloText}<br>` +
                `<span style='display:none' data-cat-armz='${cat_armz}'></span>`);
    }
    // =================================================================
    // FIM: Alteração V2.8 (Tooltip)
    // =================================================================

    const dashboardData = planoFinalData.map(row => {
        const productCode = row.product_code;
        const normalizedProductCode = productCode ? String(productCode).trim() : null;
        const productInfo = (normalizedProductCode && baseProdutosMap[normalizedProductCode]) ? baseProdutosMap[normalizedProductCode] : {}; 
        const mergedRow = {...row, ...productInfo};
        
        // Atribui a curva da base (se existir) para o mergedRow para cálculo das métricas
        if (productInfo.curva) mergedRow.curva = productInfo.curva;
        if (productInfo.nm_fabricante) mergedRow.nm_fabricante = productInfo.nm_fabricante;

        const infoHover = criarInfoHover(mergedRow);
        const grupoFinal = productInfo.grupo || row.grupo_alocado || row.grupo || (productCode && productCode !== 'Vazio' ? 'neutro' : 'Vazio');
        const corGrupo = corMapGrupo[grupoFinal] || (productCode && productCode !== 'Vazio' ? corMapGrupo.default : corMapGrupo.Vazio);
        // Usa is_alto, is_pesado e is_pequeno da Base_Produtos
        const isPesadoFinal = _parseBooleanFlag(productInfo.is_pesado);
        mergedRow.is_pesado = isPesadoFinal;
        mergedRow.is_alto = _parseBooleanFlag(productInfo.is_alto);
        mergedRow.is_pequeno = _parseBooleanFlag(productInfo.is_pequeno);
        // Ler is_fragil e degelo da Base_Produtos
        mergedRow.is_fragil = productInfo.is_fragil || '';
        mergedRow.degelo = productInfo.degelo || '';
        return { ...mergedRow, info_hover: infoHover, cor_grupo: corGrupo };
    });
    Logger.log("Dados do Dashboard processados.");


    // =================================================================
    // INÍCIO: Bloco de Métricas V2.8
    // =================================================================
    Logger.log("Iniciando cálculo de métricas V2.8...");
    const metrics = {
      totalEscaninhos: 0,
      escaninhosOcupados: 0,
      ocupacaoGlobal: 0,
      skusAlocados: new Set(),
      totalSKUs: 0,
      totalNaoAlocados: 0,
      porRua: {},
      porTipoEquip: {}
    };
    const escaninhosPorEquip = {}; // { "R1-E1": { tipo, totalBins, occupiedBins, skus, curvaA, curveCounts: {A:0,B:0,...} } }

    dashboardData.forEach(row => {
        const pCode = row.product_code;
        const ruaNum = parseInt(row.rua_num);
        if (isNaN(ruaNum)) return; // Pula linhas sem rua
        
        const ruaStr = String(ruaNum);
        const equipId = `R${ruaStr}-E${parseInt(row.equipamento_num)}`;
        const tipoEquip = row.tipo_equipamento_final || row.tipo_equipamento;
        const qtd = parseInt(row.quantidade || 0);

        // --- Lógica de Curva (copiada de baixo) ---
        let curvaOriginal = row.curva || ''; 
        let marcaOriginal = row.nm_fabricante || ''; 
        let letraCurva = '';
        if (curvaOriginal && isNaN(curvaOriginal) && String(curvaOriginal).length === 1) { letraCurva = String(curvaOriginal)[0].toUpperCase(); }
        else if (marcaOriginal && isNaN(marcaOriginal) && String(marcaOriginal).length === 1 && !isNaN(curvaOriginal) ) { letraCurva = String(marcaOriginal)[0].toUpperCase(); }
        // --- Fim Lógica de Curva ---

        metrics.totalEscaninhos++;
        
        // Inicializa sub-objetos se não existirem
        if (!metrics.porRua[ruaStr]) {
          metrics.porRua[ruaStr] = { totalEscaninhos: 0, escaninhosOcupados: 0, skus: new Set(), ocupacao: 0 };
        }
        if (!metrics.porTipoEquip[tipoEquip]) {
          metrics.porTipoEquip[tipoEquip] = { equipamentos: new Set(), totalEquip: 0, totalVazios: 0, totalCurvaA: 0, geladeirasAmarelas: new Set(), dominantCurveCounts: {} };
        }
        if (!escaninhosPorEquip[equipId]) {
          escaninhosPorEquip[equipId] = { tipo: tipoEquip, totalBins: 0, occupiedBins: 0, skus: 0, curvaA: 0, curveCounts: {} };
        }

        // Contagem de Rua
        metrics.porRua[ruaStr].totalEscaninhos++;
        // Adiciona equipamento ao Set de seu tipo
        metrics.porTipoEquip[tipoEquip].equipamentos.add(equipId);
        // Conta bin total por equipamento
        escaninhosPorEquip[equipId].totalBins++;

        // Contagem de Ocupação
        if (pCode && pCode !== 'Vazio') {
          metrics.escaninhosOcupados++;
          metrics.skusAlocados.add(pCode);
          
          metrics.porRua[ruaStr].escaninhosOcupados++;
          metrics.porRua[ruaStr].skus.add(pCode);

          escaninhosPorEquip[equipId].skus++;
          escaninhosPorEquip[equipId].occupiedBins++;
          if (letraCurva === 'A') {
            escaninhosPorEquip[equipId].curvaA++;
          }
          if (letraCurva) {
            const cc = escaninhosPorEquip[equipId].curveCounts;
            cc[letraCurva] = (cc[letraCurva] || 0) + 1;
          }
        }
    });

    // Contagem de produtos de mesma subcategoria adjacentes horizontalmente
    metrics.subcategoriaAdjacentes = []; // [{locationId1, locationId2, subcategoria, productCode1, productCode2}]
    const locationMap = new Map(); // location_id -> {productCode, subcategoria, rua, estante, nivel, posicao}
    
    // Primeiro, criar mapa de localizações
    dashboardData.forEach(row => {
        const locationId = String(row.location_id || '').trim();
        if (!locationId) return;
        
        const pCode = String(row.product_code || '').trim();
        if (!pCode || pCode === 'Vazio') return;
        
        const subcategoria = String(row.subcategoria || '').trim();
        if (!subcategoria) return;
        
        // Parse location_id: formato "LJ120001-R1-002-4A"
        const parts = locationId.split('-');
        if (parts.length < 4) return;
        
        const escaninho = parts.slice(3).join('-'); // Pega tudo depois do terceiro hífen
        const nivelMatch = escaninho.match(/^(\d+)/);
        const posicaoMatch = escaninho.match(/([A-Z]+)$/);
        const nivel = nivelMatch ? nivelMatch[1] : '0';
        const posicao = posicaoMatch ? posicaoMatch[1] : '';
        const posicaoIndex = posicao ? posicao.charCodeAt(0) - 65 : -1; // A=0, B=1, C=2...
        
        locationMap.set(locationId, {
            productCode: pCode,
            subcategoria: subcategoria,
            rua: parts[1],
            estante: parts[2],
            nivel: nivel,
            posicao: posicao,
            posicaoIndex: posicaoIndex
        });
    });
    
    // Agora, verificar adjacências horizontais
    locationMap.forEach((data1, locationId1) => {
        locationMap.forEach((data2, locationId2) => {
            if (locationId1 === locationId2) return;
            
            // Mesma subcategoria mas produtos diferentes
            if (data1.subcategoria === data2.subcategoria && data1.productCode !== data2.productCode) {
                // Mesma rua, mesma estante, mesmo nível, posições adjacentes (horizontal)
                if (data1.rua === data2.rua && 
                    data1.estante === data2.estante && 
                    data1.nivel === data2.nivel && 
                    Math.abs(data1.posicaoIndex - data2.posicaoIndex) === 1) {
                    
                    // Evitar duplicatas (se já temos A-B, não adicionar B-A)
                    const pairKey = locationId1 < locationId2 ? `${locationId1}|${locationId2}` : `${locationId2}|${locationId1}`;
                    const alreadyAdded = metrics.subcategoriaAdjacentes.some(pair => 
                        (pair.locationId1 === locationId1 && pair.locationId2 === locationId2) ||
                        (pair.locationId1 === locationId2 && pair.locationId2 === locationId1)
                    );
                    
                    if (!alreadyAdded) {
                        metrics.subcategoriaAdjacentes.push({
                            locationId1: locationId1,
                            locationId2: locationId2,
                            subcategoria: data1.subcategoria,
                            productCode1: data1.productCode,
                            productCode2: data2.productCode
                        });
                    }
                }
            }
        });
    });

    // Pós-processamento de Métricas de Equipamento (Vazios, Curva A, Dominância de Curva, Subutilização)
    metrics.underUtilized = []; // [{equipId, occupancy}]
    for (const equipId in escaninhosPorEquip) {
      const equip = escaninhosPorEquip[equipId];
      if (!metrics.porTipoEquip[equip.tipo]) continue; // Segurança
      
      // Se o equipamento não teve NENHUM sku, é vazio
      if (equip.skus === 0) {
        metrics.porTipoEquip[equip.tipo].totalVazios++;
      }
      // Se teve SKUs, e mais da metade (> 0.5) foram Curva A
      if (equip.skus > 0 && (equip.curvaA / equip.skus) > 0.5) {
        metrics.porTipoEquip[equip.tipo].totalCurvaA++;
      }

      // Dominância de curva por equipamento (considera apenas curvas com maior contagem)
      const counts = equip.curveCounts || {};
      let dominant = null, maxCount = -1;
      for (const k in counts) { if (counts[k] > maxCount) { maxCount = counts[k]; dominant = k; } }
      if (dominant) {
        const domMap = metrics.porTipoEquip[equip.tipo].dominantCurveCounts;
        domMap[dominant] = (domMap[dominant] || 0) + 1;
      }

      // Subutilização: ocupação de bins < 20%
      const occ = (equip.totalBins > 0) ? (equip.occupiedBins / equip.totalBins) : 0;
      if (occ < 0.2) {
        metrics.underUtilized.push({ equipId: equipId, occupancy: occ });
      }
    }

    // Finalização e Limpeza das Métricas
    metrics.ocupacaoGlobal = (metrics.totalEscaninhos > 0) ? (metrics.escaninhosOcupados / metrics.totalEscaninhos) : 0;
    metrics.totalSKUs = metrics.skusAlocados.size;
    delete metrics.skusAlocados; // Não precisa enviar o Set gigante

    for (const ruaStr in metrics.porRua) {
      const rua = metrics.porRua[ruaStr];
      rua.ocupacao = (rua.totalEscaninhos > 0) ? (rua.escaninhosOcupados / rua.totalEscaninhos) : 0;
      rua.totalSKUs = rua.skus.size;
      delete rua.skus;
    }
    for (const tipo in metrics.porTipoEquip) {
      const tipoData = metrics.porTipoEquip[tipo];
      tipoData.totalEquip = tipoData.equipamentos.size;
      // Converter Set de geladeiras amarelas para número
      if (tipoData.geladeirasAmarelas) {
        tipoData.totalGeladeirasAmarelas = tipoData.geladeirasAmarelas.size;
        delete tipoData.geladeirasAmarelas;
      } else {
        // Garantir que sempre existe, mesmo que seja 0
        tipoData.totalGeladeirasAmarelas = 0;
      }
      delete tipoData.equipamentos;
    }

    Logger.log("Cálculo de métricas concluído.");
    // =================================================================
    // FIM: Bloco de Métricas V2.8
    // =================================================================


    const ruas = {};
    dashboardData.forEach(row => { const ruaNum = parseInt(row.rua_num); if (!isNaN(ruaNum)) { if (!ruas[ruaNum]) ruas[ruaNum] = []; ruas[ruaNum].push(row); }});
    let content_html = "";
    const sortedRuaKeys = Object.keys(ruas).sort((a, b) => parseInt(a) - parseInt(b));
    const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (const ruaNum of sortedRuaKeys) {
        const ruaGroup = ruas[ruaNum]; const ruaNumInt = parseInt(ruaNum);
        const tituloRua = `Rua ${ruaNumInt}`;
        content_html += `<div class="rua" data-rua-num="${ruaNumInt}"><h3>${tituloRua}</h3>`;
        
        content_html += `<div class="add-equip-form" id="add-form-R${ruaNumInt}" data-rua-num="${ruaNumInt}">
                          <span>Criar Equipamento:</span>
                          <input type="number" placeholder="Nº Equip." class="add-equip-num">
                          <select class="add-equip-type">
                            <option value="">Selecione o tipo...</option>
                            </select>
                          <button class="add-equip-btn" title="Criar Equipamento">Criar</button>
                       </div>`;
        
        content_html += `<div class="equipamentos-container">`; // Continua o HTML da rua
        
        const equipamentos = {};
        ruaGroup.forEach(row => { const equipNum = parseInt(row.equipamento_num); if(!isNaN(equipNum)){ if (!equipamentos[equipNum]) equipamentos[equipNum] = []; equipamentos[equipNum].push(row); }});
        const sortedEquipKeys = Object.keys(equipamentos).sort((a, b) => parseInt(a) - parseInt(b));
        for (const equipNum of sortedEquipKeys) {
            const equipGroup = equipamentos[equipNum]; const equipNumInt = parseInt(equipNum);
            const infoEquip = equipGroup[0]; const equipId = `R${ruaNumInt}-E${equipNumInt}`;
            const tipoEquipFinal = infoEquip.tipo_equipamento_final || infoEquip.tipo_equipamento;
            const hasQuimico = equipGroup.some(row => row.grupo === 'quimico');
            const equipColor = hasQuimico ? '#c0392b' : (corMapEquip[tipoEquipFinal] || corMapEquip.default);
            
            // =================================================================
            // INÍCIO: Alteração V2.8 (Transparência)
            // =================================================================
            const totalEscaninhosEquip = equipGroup.length;
            const escaninhosOcupadosEquip = equipGroup.filter(bin => bin.product_code && bin.product_code !== 'Vazio').length;
            const ocupacaoEquip = (totalEscaninhosEquip > 0) ? (escaninhosOcupadosEquip / totalEscaninhosEquip) : 0;
            const dataOcupacaoAttr = `data-ocupacao="${ocupacaoEquip.toFixed(2)}"`;
            // =================================================================
            // FIM: Alteração V2.8 (Transparência)
            // =================================================================

            const binsByLevelAndPos = {}; let maxPosNum = 0; const levelOrder = [];
            equipGroup.forEach(binInfo => { const level = binInfo.nivel; const pos = parseInt(binInfo.escaninho_num_no_nivel); if (!level || isNaN(pos)) return; if (!binsByLevelAndPos[level]) { binsByLevelAndPos[level] = {}; levelOrder.push(level); } binsByLevelAndPos[level][pos] = binInfo; if (pos > maxPosNum) maxPosNum = pos; });
            levelOrder.sort();
            const levelNums = levelOrder.map(level => parseInt(level, 10)).filter(level => !isNaN(level));
            const minLevelNum = levelNums.length ? Math.min(...levelNums) : null;
            const maxLevelNum = levelNums.length ? Math.max(...levelNums) : null;
            const tipoEquipNorm = String(tipoEquipFinal || '').trim().toLowerCase().replace(/\s+/g, '_');
            const isShelfHeavyPref = (tipoEquipNorm === 'prateleira' || tipoEquipNorm === 'prateleira_alta');
            const numRows = levelOrder.length; const numCols = maxPosNum;
            if (numRows === 0 || numCols === 0) continue;
            let equipGridHTML = `<div class="equipamento-grid" style="--num-cols: ${numCols + 1}; --num-rows: ${numRows + 1};">`;
            equipGridHTML += `<div class="grid-cell header-cell corner-cell"></div>`;
            for (let j = 1; j <= numCols; j++) { equipGridHTML += `<div class="grid-cell header-cell col-header">${alfabeto[j-1]}</div>`; }
            for (let visualRowIndex = 1; visualRowIndex <= numRows; visualRowIndex++) {
                const levelArrayIndex = numRows - visualRowIndex; const level = levelOrder[levelArrayIndex];
                equipGridHTML += `<div class="grid-cell header-cell row-header">${visualRowIndex}</div>`;
                for (let j = 1; j <= numCols; j++) {
                    const binInfo = (binsByLevelAndPos[level] && binsByLevelAndPos[level][j]) ? binsByLevelAndPos[level][j] : null;
                    if (binInfo) {
                        const productCode = binInfo.product_code || 'Vazio';
                        const mergedBinInfo = binInfo; 
                        const corGrupo = mergedBinInfo.cor_grupo;
                        const normalizedProductCode = productCode ? String(productCode).trim() : null;
                        let curvaOriginalBase = (normalizedProductCode && baseProdutosMap[normalizedProductCode] ? baseProdutosMap[normalizedProductCode] : {}).curva || ''; 
                        let curvaOriginalPlano = mergedBinInfo.curva || ''; 
                        let marcaOriginal = (normalizedProductCode && baseProdutosMap[normalizedProductCode] ? baseProdutosMap[normalizedProductCode] : {}).nm_fabricante || mergedBinInfo.nm_fabricante || ''; 
                        let letraCurva = '';
                        if (curvaOriginalBase && isNaN(curvaOriginalBase) && String(curvaOriginalBase).length === 1) { letraCurva = String(curvaOriginalBase)[0].toUpperCase(); } else if (curvaOriginalPlano && isNaN(curvaOriginalPlano) && String(curvaOriginalPlano).length === 1 && !letraCurva) { letraCurva = String(curvaOriginalPlano)[0].toUpperCase(); } else if (marcaOriginal && isNaN(marcaOriginal) && String(marcaOriginal).length === 1 && (!isNaN(curvaOriginalPlano) || !isNaN(curvaOriginalBase)) && !letraCurva ) { letraCurva = String(marcaOriginal)[0].toUpperCase(); }
                        const levelNumMatch = String(binInfo.location_id || '').match(/-(\d+)[A-Za-z]+$/);
                        const nivelNumAttr = levelNumMatch ? levelNumMatch[1] : '';
                        let classes = 'escaninho grid-cell'; 
                        if (productCode !== 'Vazio') { 
                            if (mergedBinInfo.is_pesado) classes += ' pesado'; 
                            if (mergedBinInfo.is_alto) classes += ' alto'; 
                            if (mergedBinInfo.is_pequeno) classes += ' pequeno';
                            if (mergedBinInfo.is_pesado && isShelfHeavyPref && minLevelNum !== null && maxLevelNum !== null) {
                                const levelNumForCheck = parseInt(nivelNumAttr || binInfo.nivel, 10);
                                if (!isNaN(levelNumForCheck) && (levelNumForCheck === minLevelNum || levelNumForCheck === maxLevelNum)) {
                                    classes += ' pesado-extremo';
                                }
                            }
                            // Adicionar classes para frágil e degelo = NAO
                            const isFragil = String(mergedBinInfo.is_fragil || '').toUpperCase().trim();
                            const degelo = String(mergedBinInfo.degelo || '').toUpperCase().trim();
                            if (isFragil === 'SIM') classes += ' fragil';
                            if (degelo === 'NAO') classes += ' degelo-nao';
                        }
                        const draggable = ''; const subcatSegura = escapeHtml(mergedBinInfo.subcategoria || 'Vazio'); const infoHover = mergedBinInfo.info_hover || 'Info indisponível';
                        
                        // Adicionar data attributes para frágil e degelo
                        const isFragilAttr = productCode !== 'Vazio' ? String(mergedBinInfo.is_fragil || '').toUpperCase().trim() : '';
                        const degeloAttr = productCode !== 'Vazio' ? String(mergedBinInfo.degelo || '').toUpperCase().trim() : '';
                        
                        equipGridHTML += (`<div class="${classes}" id="bin-${binInfo.location_id}" ` + 
                                         `data-product-code="${productCode}" ` + 
                                         `data-product-name="${escapeHtml(mergedBinInfo.product_name || '')}" ` + 
                                         `data-subcategory="${subcatSegura}" ` + 
                                         `data-equip-type="${tipoEquipFinal}" ` + 
                                         `data-cat-armz="${mergedBinInfo.categoria_armazenagem || 'N/A'}" ` + 
                                         `data-fragil="${isFragilAttr}" ` +
                                         `data-degelo="${degeloAttr}" ` +
                                         `data-peso-kg="${mergedBinInfo.peso_kg_unitario || ''}" ` +
                                         `data-rua-num="${ruaNumInt}" ` +           
                                         `data-equip-num="${equipNumInt}" ` +        
                                         `data-level-num="${nivelNumAttr}" ` +
                                         `style="background-color: ${corGrupo};" ` + 
                                         `title="${binInfo.location_id}" ${draggable}>` + 
                                         `${letraCurva}<span class="tooltip">${infoHover}</span></div>`);
                    } else { equipGridHTML += `<div class="grid-cell empty-cell"></div>`; }
                }
            } equipGridHTML += `</div>`;
            
            // Verificar se há produtos com degelo = NAO (contar quantos)
            let countDegeloNao = 0;
            equipGroup.forEach(row => {
                const productCode = row.product_code || '';
                if (!productCode || productCode === 'Vazio') return;
                const normalizedCode = String(productCode).trim();
                const productData = baseProdutosMap[normalizedCode] || {};
                const degelo = String(productData.degelo || '').toUpperCase().trim();
                if (degelo === 'NAO') {
                    countDegeloNao++;
                }
            });
            // Só mostrar amarelo/raio se tiver MAIS DE 5 itens de degelo = NAO
            const hasDegeloNao = countDegeloNao > 5;
            const degeloEmoji = hasDegeloNao ? ' ⚡' : '';
            
            // Se for geladeira e tiver degelo = NAO (mais de 5), pintar de amarelo
            let corFinalEquip = equipColor;
            if (hasDegeloNao && (tipoEquipFinal === 'geladeira' || tipoEquipFinal === 'geladeira_alta')) {
                corFinalEquip = '#f39c12'; // Amarelo
                // Contar geladeira amarela nas métricas (usar Set para evitar duplicatas)
                if (metrics.porTipoEquip[tipoEquipFinal]) {
                    // Garantir que o Set existe
                    if (!metrics.porTipoEquip[tipoEquipFinal].geladeirasAmarelas) {
                        metrics.porTipoEquip[tipoEquipFinal].geladeirasAmarelas = new Set();
                    }
                    metrics.porTipoEquip[tipoEquipFinal].geladeirasAmarelas.add(equipId);
                }
            }
            
            // Adiciona o data-ocupacao ao header
            content_html += `<div class="equipamento" id="${equipId}"><div class="equipamento-header" style="background-color: ${corFinalEquip};" ${dataOcupacaoAttr}><button class="change-type-btn" title="Alterar Tipo de Equipamento">⚙</button><strong>Equip. #${equipNumInt}${degeloEmoji}</strong><span>(${tipoEquipFinal})</span><button class="remove-equip-btn" title="Remover Equipamento (Mover itens para Prancheta)">×</button></div><div class="micro-view" id="micro-${equipId}">${equipGridHTML}</div></div>`;

        } content_html += '</div></div>';
    }
    Logger.log("HTML do conteúdo principal gerado.");

    // --- Seção de Falhas (Não Alocados) ---
    Logger.log("Iniciando verificação de produtos não alocados (V4 - Base vs Plano)...");
    
    const alocatedProductCodes = new Set();
    planoFinalData.forEach(row => {
        if (row.product_code && row.product_code !== 'Vazio') {
            const normalizedCode = String(row.product_code).trim();
            if(normalizedCode && normalizedCode !== 'Vazio') {
              alocatedProductCodes.add(normalizedCode);
            }
        }
    });
    if (!IS_TESTING_MODE) Logger.log(`Encontrados ${alocatedProductCodes.size} produtos únicos alocados no Plano Final.`);

    const motivoFalhaMap = new Map();
    logFalhasData.forEach(row => {
        if (row.product_code && String(row.status || '').toLowerCase() === 'falha') {
            const pCodeStr = String(row.product_code).trim();
            if (pCodeStr && !motivoFalhaMap.has(pCodeStr)) {
                motivoFalhaMap.set(pCodeStr, row.motivo || "Motivo desconhecido");
            }
        }
    });
    if (!IS_TESTING_MODE) Logger.log(`Encontrados ${motivoFalhaMap.size} motivos no Log de Falhas.`);

    const finalUnallocatedList = [];
    if (!IS_TESTING_MODE) Logger.log(`Verificando ${Object.keys(baseProdutosMap).length} produtos da Base_Produtos...`);
    
    // Verifica especificamente se "AAA" está na base (apenas em modo não-teste)
    if (!IS_TESTING_MODE && baseProdutosMap['AAA']) {
      Logger.log(`PRODUTO AAA ENCONTRADO NA BASE: ${JSON.stringify(baseProdutosMap['AAA'])}`);
      Logger.log(`AAA está alocado? ${alocatedProductCodes.has('AAA')}`);
    } else if (!IS_TESTING_MODE && !baseProdutosMap['AAA']) {
      Logger.log(`PRODUTO AAA NÃO ENCONTRADO NA BASE!`);
      Logger.log(`Códigos disponíveis (primeiros 10): ${Object.keys(baseProdutosMap).slice(0, 10).join(', ')}`);
    }
    
    for (const [pCode, productInfo] of Object.entries(baseProdutosMap)) { 
        const isAlocated = alocatedProductCodes.has(pCode);
        if (!isAlocated) {
            const motivo = motivoFalhaMap.get(pCode) || 'Não alocado (Ausente no Plano Final)';
            // Usar escaninhos_necessarios da Base_Produtos como base
            let numEscaninhos = parseInt(String(productInfo.escaninhos_necessarios || '').replace(',', '.'), 10);
            if (!numEscaninhos || numEscaninhos < 1) numEscaninhos = 1;
            
            // Criar uma entrada para cada escaninho necessário
            for (let i = 0; i < numEscaninhos; i++) {
                finalUnallocatedList.push({
                    ...productInfo,
                    product_code: pCode,
                    status: 'falha',
                    motivo: motivo,
                    escaninho_index: i + 1 // 1, 2, 3...
                });
            }
            
            // Log apenas para produtos não alocados (para não poluir o log) - apenas em modo não-teste
            if (!IS_TESTING_MODE && (pCode === 'AAA' || finalUnallocatedList.length <= 10)) {
              Logger.log(`Produto não alocado encontrado: "${pCode}" - ${productInfo.product_name || 'Sem nome'} (${numEscaninhos} escaninho(s) necessário(s), base: escaninhos_necessarios)`);
            }
        }
    }
    if (!IS_TESTING_MODE) Logger.log(`Total de ${finalUnallocatedList.length} entradas de produtos não alocados criadas (incluindo múltiplos escaninhos).`);
    
    // Log detalhado para debug (apenas em modo não-teste)
    if (!IS_TESTING_MODE) {
    Logger.log(`Produtos na Base_Produtos: ${Object.keys(baseProdutosMap).length}`);
    Logger.log(`Produtos alocados no Plano: ${alocatedProductCodes.size}`);
    Logger.log(`Exemplos de códigos na Base: ${Object.keys(baseProdutosMap).slice(0, 5).join(', ')}`);
    Logger.log(`Exemplos de códigos alocados: ${Array.from(alocatedProductCodes).slice(0, 5).join(', ')}`);
    }
    
    // Contar produtos únicos (não escaninhos) para a métrica
    // CORREÇÃO: Contar baseado no total de linhas de dados na Base_Produtos (todas as linhas, mesmo sem código válido)
    // menos os alocados (que só podem ser produtos com código válido)
    const totalLinhasBase = baseProdutosData.length; // Total de linhas de dados (exclui cabeçalho)
    const totalProdutosAlocados = alocatedProductCodes.size;
    metrics.totalNaoAlocados = totalLinhasBase - totalProdutosAlocados; // Total de linhas na base menos os alocados


    let failed_products_html = ""; 
    const unallocated_products_list = [];
    
    if (finalUnallocatedList.length > 0) { 
      failed_products_html = '<div class="container-falhas"><h2>Produtos Não Alocados <select id="falhas-selector"><option value="">Selecione um motivo...</option>';
      const falhasPorMotivo = {};
      
      finalUnallocatedList.forEach((falha, index) => { 
        const motivo = falha.motivo || "Motivo desconhecido";
        if (!falhasPorMotivo[motivo]) falhasPorMotivo[motivo] = [];
        
        const mergedInfo = falha; 

        falhasPorMotivo[motivo].push(mergedInfo);
        
        const product_id = `unallocated-${index}`;
        const infoHoverHtml = criarInfoHover(mergedInfo);
        let classes = [];
        // Buscar is_pesado, is_alto, is_pequeno, is_fragil e degelo da Base_Produtos
        const baseProductInfo = baseProdutosMap[mergedInfo.product_code] || {};
        const isPesado = _parseBooleanFlag(baseProductInfo.is_pesado);
        const isAlto = _parseBooleanFlag(baseProductInfo.is_alto);
        const isPequeno = _parseBooleanFlag(baseProductInfo.is_pequeno);
        const isFragil = String(baseProductInfo.is_fragil || '').toUpperCase().trim();
        const degelo = String(baseProductInfo.degelo || '').toUpperCase().trim();
        if (isPesado) classes.push('pesado'); 
        if (isAlto) classes.push('alto');
        if (isPequeno) classes.push('pequeno');
        if (isFragil === 'SIM') classes.push('fragil');
        if (degelo === 'NAO') classes.push('degelo-nao');
        
        unallocated_products_list.push({ 
            id: product_id, 
            product_code: mergedInfo.product_code, 
            product_name: mergedInfo.product_name || 'Nome não encontrado', 
            cor_grupo: corMapGrupo[mergedInfo.grupo] || corMapGrupo.default, 
            curva: (() => { 
                let co = mergedInfo.curva || ''; 
                let mo = mergedInfo.nm_fabricante || ''; 
                if (co && isNaN(co) && String(co).length === 1) return String(co)[0].toUpperCase(); 
                if (mo && isNaN(mo) && String(mo).length === 1 && !isNaN(co)) return String(mo)[0].toUpperCase(); 
                return ''; 
            })(), 
            info_hover: infoHoverHtml, 
            classes: classes.join(' '), 
            cat_armz: mergedInfo.categoria_armazenagem, 
            is_pesado: isPesado,
            is_alto: isAlto,
            is_pequeno: isPequeno,
            is_fragil: isFragil,
            degelo: degelo, 
            dataset: { 
                productCode: mergedInfo.product_code, 
                catArmz: mergedInfo.categoria_armazenagem || 'N/A' 
            } 
        });
      });
      
      let i = 0; for (const motivo in falhasPorMotivo) { const id_motivo = `motivo-${i}`; failed_products_html += `<option value="${id_motivo}">${escapeHtml(motivo.substring(0, 80))}</option>`; i++; }
      failed_products_html += '</select></h2>'; i = 0;
      
      for (const motivo in falhasPorMotivo) {
        const id_motivo = `motivo-${i}`; const tabelaFiltrada = falhasPorMotivo[motivo];
        failed_products_html += `<div id="${id_motivo}" class="tabela-falhas-container" style="display:none;"><h4>${escapeHtml(motivo)} (${tabelaFiltrada.length} produtos)</h4><table class="tabela-falhas"><tr><th>Produto</th><th>Código</th><th>Curva</th><th>Cat. Armaz.</th><th>Qtd.</th></tr>`;
        tabelaFiltrada.forEach(row => { 
            let co = row.curva || ''; 
            let mo = row.nm_fabricante || ''; 
            let ct = ''; 
            if (co && isNaN(co) && String(co).length === 1) ct = String(co).toUpperCase(); 
            else if (mo && isNaN(mo) && String(mo).length === 1 && !isNaN(co)) ct = String(mo).toUpperCase(); 
            failed_products_html += (`<tr><td>${escapeHtml(row.product_name || '')}</td><td>${row.product_code || ''}</td><td>${ct}</td><td>${row.categoria_armazenagem || ''}</td><td>${parseInt(row.quantidade || 0)}</td></tr>`); 
        });
        failed_products_html += '</table></div>'; i++;
      } 
      failed_products_html += '</div>';
    }
    Logger.log("HTML da seção de falhas gerado.");


    // --- Dados de Pesquisa ---
    const productLocationMap = {}; const productsForSearchSet = {};
    dashboardData.forEach(row => { 
      const code = row.product_code; 
      if (code && code !== 'Vazio') { 
        const normalizedCode = String(code).trim();
        if(normalizedCode && normalizedCode !== 'Vazio') {
          const equipId = `R${parseInt(row.rua_num)}-E${parseInt(row.equipamento_num)}`; 
          if (!productLocationMap[normalizedCode]) productLocationMap[normalizedCode] = []; 
          if (productLocationMap[normalizedCode].indexOf(equipId) === -1) { 
            productLocationMap[normalizedCode].push(equipId); 
          } 
          const productName = row.product_name; 
          if(productName && !productsForSearchSet[normalizedCode]){ 
            productsForSearchSet[normalizedCode] = { name: String(productName), code: normalizedCode }; 
          } 
        }
      } 
    });
    Logger.log("Dados de pesquisa gerados.");

    // --- Retornar ---
    Logger.log("getInitialData() V5 (Métricas) concluído com sucesso.");
    
    // Carrega o mapeamento de código de barras
    const barcodeMap = getBarcodeMap();
    
    // Obter título da planilha (texto entre [])
    const spreadsheetTitle = getSpreadsheetTitle();
    
    return {
      content_html: content_html, 
      failed_products_section: failed_products_html,
      all_products_json: JSON.stringify(Object.values(productsForSearchSet)),
      product_location_map_json: JSON.stringify(productLocationMap),
      unallocated_products_json: JSON.stringify(unallocated_products_list.reduce((acc, p) => { acc[p.id] = p; return acc; }, {})),
      all_products_data_map_json: JSON.stringify(Object.fromEntries(Object.entries(baseProdutosMap))),
      equipTypesJson: JSON.stringify(equipTypesList),
      metrics_panel_data_json: JSON.stringify(metrics), // <-- NOVO
      barcode_map_json: JSON.stringify(barcodeMap), // <-- NOVO: Mapeamento de código de barras
      spreadsheet_title: spreadsheetTitle, // <-- NOVO: Título da planilha
      limite_peso_kg: limitePeso // <-- NOVO: Limite para pesado
    };
    
    if (!IS_TESTING_MODE) Logger.log("getInitialData() V5 (Métricas) concluído com sucesso.");

  } catch (error) {
    Logger.log(`ERRO CRÍTICO em getInitialData: ${error.message} \n ${error.stack}`);
    return { error: `Erro ao buscar dados iniciais: ${error.message}. Verifique os logs do Apps Script para detalhes.` };
  }
}

/**
 * Cria um novo produto na aba Base_Produtos
 * Campos obrigatórios: product_code, product_name, quantidade e volumetria (altura_cm, largura_cm, comprimento_cm ou vol_L_unitario)
 */
function addNewProduct(product) {
  try {
    if (!IS_TESTING_MODE) Logger.log("addNewProduct chamado com:", JSON.stringify(product));
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOME_ABA_BASE_PRODUTOS);
    if (!sheet) {
      Logger.log(`ERRO: Aba "${NOME_ABA_BASE_PRODUTOS}" não encontrada.`);
      throw new Error(`Aba "${NOME_ABA_BASE_PRODUTOS}" não encontrada.`);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    if (!IS_TESTING_MODE) Logger.log("Headers encontrados:", headers);
    
    const required = ['product_code', 'product_name', 'quantidade', 'vol_L_unitario'];
    
    // Validação: vol_L_unitario é obrigatório
    const hasVolUnit = product.vol_L_unitario !== undefined && product.vol_L_unitario !== null && String(product.vol_L_unitario).trim() !== '';
    
    if (!IS_TESTING_MODE) Logger.log(`Validação volumetria: hasVolUnit=${hasVolUnit}, valor=${product.vol_L_unitario}`);
    
    if (!hasVolUnit) {
      const errorMsg = 'Campo obrigatório: Vol. Unitário (L) deve ser preenchido.';
      Logger.log(`ERRO: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    required.forEach(k => { 
      if (!product[k] || String(product[k]).trim() === '') {
        const errorMsg = `Campo obrigatório ausente: ${k}`;
        Logger.log(`ERRO: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    });

    // Função auxiliar para converter valores numéricos de forma segura
    const parseNum = (val) => {
      // Se for null, undefined ou string vazia, retorna null
      if (val === null || val === undefined || val === '') return null;
      
      // Converte para string e remove espaços
      const str = String(val).trim();
      if (str === '' || str === 'null' || str === 'undefined') return null;
      
      // Substitui vírgula por ponto
      const normalized = str.replace(',', '.');
      
      // Tenta converter para número
      const num = parseFloat(normalized);
      
      // Se não for um número válido, retorna null
      if (isNaN(num)) {
        if (!IS_TESTING_MODE) Logger.log(`AVISO: Valor não numérico ignorado: "${val}" (normalizado: "${normalized}")`);
        return null;
      }
      
      if (!IS_TESTING_MODE) Logger.log(`parseNum: "${val}" -> "${normalized}" -> ${num}`);
      return num;
    };
    
    // Verifica se a coluna "Adicionado_manualmente" existe, se não, cria
    let adicionadoManualmenteIndex = headers.indexOf('Adicionado_manualmente');
    if (adicionadoManualmenteIndex === -1) {
      if (!IS_TESTING_MODE) Logger.log("Coluna 'Adicionado_manualmente' não encontrada. Criando...");
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue('Adicionado_manualmente');
      headers.push('Adicionado_manualmente');
      adicionadoManualmenteIndex = headers.length - 1;
      if (!IS_TESTING_MODE) Logger.log("Coluna 'Adicionado_manualmente' criada na posição " + (lastCol + 1));
    }

    // Monta a linha respeitando os headers existentes (não escreve colunas inexistentes)
    const rowValues = headers.map((h, index) => {
      const key = String(h).trim();
      switch (key) {
        case 'product_code': return String(product.product_code || '').trim();
        case 'product_name': return String(product.product_name || '').trim();
        case 'quantidade': 
          const qtd = parseInt(product.quantidade || 0, 10);
          return isNaN(qtd) ? 0 : qtd;
        case 'altura_cm': return parseNum(product.altura_cm);
        case 'largura_cm': return parseNum(product.largura_cm);
        case 'comprimento_cm': return parseNum(product.comprimento_cm);
        case 'vol_L_unitario': 
        case 'vol_l_unitario': 
          return parseNum(product.vol_L_unitario || product.vol_l_unitario);
        case 'peso_kg_unitario': return parseNum(product.peso_kg_unitario);
        case 'subcategoria': return String(product.subcategoria || '').trim() || null;
        case 'categoria_armazenagem': return String(product.categoria_armazenagem || '').trim() || null;
        case 'categoria_site': return String(product.categoria_site || '').trim() || null;
        case 'nm_fabricante': return String(product.nm_fabricante || '').trim() || null;
        case 'curva': return String(product.curva || '').trim() || null;
        case 'Adicionado_manualmente': return 'SIM';
        default:
          // Copia qualquer outro campo se vier no payload e existir nos headers
          if (product.hasOwnProperty(key)) {
            const val = product[key];
            if (val === null || val === undefined || val === '') return null;
            return val;
          }
          return null;
      }
    });

    if (!IS_TESTING_MODE) {
    Logger.log("Headers:", headers);
    Logger.log("Produto recebido:", JSON.stringify(product));
    Logger.log("Valores da linha a serem inseridos:", rowValues);
    Logger.log("Mapeamento de valores por coluna:");
    headers.forEach((h, i) => {
      Logger.log(`  Coluna ${i + 1} (${h}): ${rowValues[i]} (tipo: ${typeof rowValues[i]})`);
    });
    }
    
    // Escreve na planilha
    const newRowNum = sheet.getLastRow() + 1;
    if (!IS_TESTING_MODE) Logger.log(`Escrevendo na linha ${newRowNum}...`);
    
    // Identifica índices das colunas numéricas para formatar corretamente
    const numericColumns = ['quantidade', 'altura_cm', 'largura_cm', 'comprimento_cm', 
                           'vol_L_unitario', 'vol_l_unitario', 'peso_kg_unitario', 
                           'vol_L_total', 'venda_total', 'venda_media_diaria', 'dias_estoque'];
    const numericColumnIndices = [];
    headers.forEach((h, i) => {
      const key = String(h).trim().toLowerCase();
      if (numericColumns.includes(key)) {
        numericColumnIndices.push(i + 1); // +1 porque as colunas começam em 1
      }
    });
    
    // Escreve os valores
    sheet.getRange(newRowNum, 1, 1, rowValues.length).setValues([rowValues]);
    
    // Formata as colunas numéricas como número (não data!)
    if (numericColumnIndices.length > 0) {
      numericColumnIndices.forEach(colIndex => {
        const cell = sheet.getRange(newRowNum, colIndex);
        // Força formatação como número com 2 casas decimais
        cell.setNumberFormat('#,##0.00');
        if (!IS_TESTING_MODE) Logger.log(`Coluna ${colIndex} (${headers[colIndex - 1]}) formatada como número`);
      });
    }
    
    SpreadsheetApp.flush();
    
    // Verifica o que foi realmente escrito (apenas em modo não-teste)
    if (!IS_TESTING_MODE) {
    const writtenValues = sheet.getRange(newRowNum, 1, 1, rowValues.length).getValues()[0];
    Logger.log("Valores realmente escritos na planilha:");
    headers.forEach((h, i) => {
      Logger.log(`  Coluna ${i + 1} (${h}): ${writtenValues[i]} (tipo: ${typeof writtenValues[i]})`);
    });
    }
    
    // Log no Log_Reenderecamento
    try {
      const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);
      if (logSheet) {
        const user = Session.getEffectiveUser().getEmail();
        const logDateTime = _getLogDateTime("America/Sao_Paulo");
        appendLogEntries(logSheet, [{
          product_code: product.product_code,
          location_id_anterior: 'CRIADO',
          location_id_novo: 'Base_Produtos',
          data: logDateTime.data,
          hora: logDateTime.hora,
          motivo: 'MANUAL-PRODUTO-CREATE',
          usuario: user
        }]);
        if (!IS_TESTING_MODE) Logger.log("Log de reendereçamento atualizado com sucesso");
      } else {
        if (!IS_TESTING_MODE) Logger.log("AVISO: Aba Log_Reenderecamento não encontrada para log");
      }
    } catch (logError) {
      if (!IS_TESTING_MODE) Logger.log(`AVISO: Erro ao atualizar log de reendereçamento: ${logError.message}`);
    }
    
    // Limpa TODOS os caches para refletir o novo produto
    // Isso garante que getInitialData() leia dados frescos
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    SCRIPT_CACHE.remove('barcode_map_v2.8');
    // Limpa qualquer cache relacionado a Base_Produtos
    const allCacheKeys = ['dic_cat_map_v2.3.18', 'barcode_map_v2.8'];
    if (!IS_TESTING_MODE) Logger.log("Cache limpo para refletir novo produto. getInitialData() deve ler dados frescos.");

    if (!IS_TESTING_MODE) Logger.log("Produto cadastrado com sucesso!");
    return { success: true };
  } catch (e) {
    Logger.log(`ERRO em addNewProduct: ${e.message} \n ${e.stack}`);
    return { success: false, error: e.message };
  }
}


/**
 * BUSCA E CACHEA MAPA location_id -> row_number
 */
function getLocationIdToRowMap(planoSheet, headers) {
    let locationIdToRowMap = {};
    const cacheKey = 'location_id_map_v2.7';
    const cached = SCRIPT_CACHE.get(cacheKey);
    if(cached) {
        try { locationIdToRowMap = JSON.parse(cached); } catch(e){ Logger.log("Erro ao parsear cache do mapa de localização. Recriando...");}
    }

    if (Object.keys(locationIdToRowMap).length === 0) {
        Logger.log("Criando/Recriando cache de mapa de localização...");
        const data = planoSheet.getDataRange().getValues();
        data.shift(); // Remove header
        locationIdToRowMap = {};
        const locationColIndex = headers.indexOf('location_id');
        if (locationColIndex === -1) {
            Logger.log("ERRO FATAL: Coluna 'location_id' não encontrada nos headers: " + headers.join(', '));
            throw new Error("Coluna 'location_id' não encontrada na aba Plano Final.");
        }
        data.forEach((row, index) => {
            if (row[locationColIndex]) {
                locationIdToRowMap[row[locationColIndex]] = index + 2;
            }
        });
        try {
          const mapString = JSON.stringify(locationIdToRowMap);
          if (mapString.length < 100000) { 
            SCRIPT_CACHE.put(cacheKey, mapString, CACHE_TIMEOUT_SECONDS);
            Logger.log(`Cache de mapa de localização criado (${Object.keys(locationIdToRowMap).length} itens).`);
          } else {
            Logger.log(`AVISO: Mapa de localização (${mapString.length} bytes) muito grande para cache. Será gerado a cada execução.`);
          }
        } catch (e) {
            Logger.log(`Erro ao stringificar ou salvar mapa de localização no cache: ${e.message}`);
        }
    }
    return locationIdToRowMap;
}

/**
 * BUSCA E CACHEA HEADERS
 */
function getHeaders(planoSheet) {
    let headers = [];
    const cacheKey = 'plano_headers_v2.7';
    const cached = SCRIPT_CACHE.get(cacheKey);
      if(cached) {
        try { headers = JSON.parse(cached); } catch(e){ Logger.log("Erro ao parsear cache dos headers. Recriando...");}
    }

    if (headers.length === 0) {
        Logger.log("Criando/Recriando cache de headers...");
        headers = planoSheet.getRange(1, 1, 1, planoSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        try {
          const headersString = JSON.stringify(headers);
            if (headersString.length < 100000) { // Cache limit
            SCRIPT_CACHE.put(cacheKey, headersString, CACHE_TIMEOUT_SECONDS);
            Logger.log("Cache de headers criado.");
            } else {
                Logger.log("AVISO: Lista de headers muito grande para cache.");
            }
        } catch(e) {
            Logger.log(`Erro ao stringificar ou salvar headers no cache: ${e.message}`);
        }
    }
    return headers;
}

/**
 * ATUALIZA UMA LINHA NO Plano_Enderecamento_Final
 */
function updatePlanoFinalRow(planoSheet, headers, rowNumber, productInfo, originalRowDataFromCaller) {
  if (!rowNumber) {
    Logger.log("updatePlanoFinalRow chamado com rowNumber inválido.");
    return;
  }
  const originalRowData = originalRowDataFromCaller || planoSheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];

  const p = productInfo || {};
  const isVazio = !productInfo || productInfo.product_code === 'Vazio';

  const newRowData = headers.map((header, index) => {
    switch (header) {
      // Colunas de Produto (Vêm de productInfo)
      case 'product_code': case 'produto_alocado_code': return isVazio ? null : (p.product_code ? String(p.product_code).trim() : null);
      case 'product_name': return isVazio ? null : (p.product_name || null);
      case 'curva': return isVazio ? null : (p.curva || null);
      case 'grupo': case 'grupo_alocado': return isVazio ? null : (p.grupo || null);
      case 'categoria_armazenagem': return isVazio ? null : (p.categoria_armazenagem || null);
      case 'vol_l_unitario': case 'vol_L_unitario': return isVazio ? null : (p.vol_l_unitario || p.vol_L_unitario || null);
      case 'quantidade': return isVazio ? null : (p.quantidade || null);
      case 'venda_total': return isVazio ? null : (p.venda_total || null);
      case 'nm_fabricante': return isVazio ? null : (p.nm_fabricante || null);
      case 'altura_cm': return isVazio ? null : (p.altura_cm || null);
      case 'peso_kg_unitario': return isVazio ? null : (p.peso_kg_unitario || null);
      case 'subcategoria': return isVazio ? null : (p.subcategoria || null);
      case 'is_pesado': return isVazio ? false : _parseBooleanFlag(p.is_pesado);
      case 'is_alto': return isVazio ? false : _parseBooleanFlag(p.is_alto);

      // Colunas de Log (Atualizadas)
      case 'is_realocado': return !isVazio;
      case 'location_id_atual':
          const locIdIndex = headers.indexOf('location_id');
          return isVazio ? null : (locIdIndex !== -1 ? originalRowData[locIdIndex] : null);

      // Colunas de Localização (Preservadas de originalRowData)
      case 'location_id': case 'galpao_id': case 'rua_num': case 'equipamento_num': case 'tipo_equipamento': case 'nivel': case 'escaninho_num_no_nivel': case 'capacidade_l': case 'exclusivo_para': case 'limite_altura_cm': case 'grupos_proibidos_neste_local': case 'is_hot_zone': case 'is_nivel_alto': case 'is_nivel_inferior': case 'tipo_equipamento_final':
        return originalRowData[index];

      // Default (Preserva o valor original da linha)
      default:
         return originalRowData[index];
    }
  });
  planoSheet.getRange(rowNumber, 1, 1, headers.length).setValues([newRowData]);
}

/**
 * Função Auxiliar para construir o valor da célula na nova linha
 */
function buildNewRowValue(header, index, productInfo, originalRowData, headers) {
    const p = productInfo || {};
    const isVazio = !productInfo || productInfo.product_code === 'Vazio';
    // Garantir que originalRowData seja um array válido
    if (!originalRowData || !Array.isArray(originalRowData)) {
      originalRowData = [];
    }

    switch (header) {
      // Colunas de Produto (Vêm de productInfo)
      case 'product_code': case 'produto_alocado_code': return isVazio ? null : (p.product_code ? String(p.product_code).trim() : null);
      case 'product_name': return isVazio ? null : (p.product_name || null);
      case 'curva': return isVazio ? null : (p.curva || null);
      case 'grupo': case 'grupo_alocado': return isVazio ? null : (p.grupo || null);
      case 'categoria_armazenagem': return isVazio ? null : (p.categoria_armazenagem || null);
      case 'vol_l_unitario': case 'vol_L_unitario': return isVazio ? null : (p.vol_l_unitario || p.vol_L_unitario || null);
      case 'quantidade': return isVazio ? null : (p.quantidade || null);
      case 'venda_total': return isVazio ? null : (p.venda_total || null);
      case 'nm_fabricante': return isVazio ? null : (p.nm_fabricante || null);
      case 'altura_cm': return isVazio ? null : (p.altura_cm || null);
      case 'peso_kg_unitario': return isVazio ? null : (p.peso_kg_unitario || null);
      case 'subcategoria': return isVazio ? null : (p.subcategoria || null);
      case 'is_pesado': return isVazio ? false : _parseBooleanFlag(p.is_pesado);
      case 'is_alto': return isVazio ? false : _parseBooleanFlag(p.is_alto);

      // Colunas de Log (Atualizadas com base no productInfo)
      case 'is_realocado': return !isVazio;
      case 'location_id_atual':
          const locIdIndex = headers.indexOf('location_id');
          return isVazio ? null : (locIdIndex !== -1 ? originalRowData[locIdIndex] : null);

      // Colunas de Localização (Preservadas de originalRowData)
      case 'location_id': case 'galpao_id': case 'rua_num': case 'equipamento_num': case 'tipo_equipamento': case 'nivel': case 'escaninho_num_no_nivel': case 'capacidade_l': case 'exclusivo_para': case 'limite_altura_cm': case 'grupos_proibidos_neste_local': case 'is_hot_zone': case 'is_nivel_alto': case 'is_nivel_inferior': case 'tipo_equipamento_final':
        return (index < originalRowData.length) ? originalRowData[index] : null;

      // Default (Preserva o valor original da linha)
      default:
        return (index < originalRowData.length) ? originalRowData[index] : null;
    }
}


// --- FUNÇÕES DE SALVAMENTO ---

/**
 * PONTO DE ENTRADA PARA MOVIMENTOS SIMPLES (V2.4.1 - Log de UNALLOCATED)
 */
function saveSingleMove(move) {
  try {
    const user = Session.getEffectiveUser().getEmail();
    const { productCode, locAnteriorId, locNovoId, productInfo } = move;

    if (locNovoId === PRANCHETA_ID) {
      Logger.log(`Movimento SIMPLES para Prancheta ignorado: ${productCode} de ${locAnteriorId}`);
      return { success: true, message: "Ignorado (Prancheta)" };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);
    const headers = getHeaders(planoSheet);
    const locationIdToRowMap = getLocationIdToRowMap(planoSheet, headers);

    const cleanAnteriorId = locAnteriorId ? locAnteriorId.replace('bin-', '') : null;
    const cleanNovoId = locNovoId ? locNovoId.replace('bin-', '') : null;
    const rowAnterior = cleanAnteriorId ? locationIdToRowMap[cleanAnteriorId] : null;
    const rowNovo = cleanNovoId ? locationIdToRowMap[cleanNovoId] : null;

    // 1. Limpar Origem (se não for virtual)
    if (rowAnterior && locAnteriorId !== PRANCHETA_ID && locAnteriorId !== UNALLOCATED_ID) {
      updatePlanoFinalRow(planoSheet, headers, rowAnterior, null, null); 
      Logger.log(`Movimento SIMPLES: Origem limpa: ${cleanAnteriorId} (Linha ${rowAnterior})`);
    } else if (locAnteriorId !== PRANCHETA_ID && locAnteriorId !== UNALLOCATED_ID) {
       Logger.log(`AVISO (Mov. Simples): LocAnterior não encontrado para limpar: ${cleanAnteriorId}.`);
    }

    // 2. Preencher Destino (se não for virtual)
    if (rowNovo && locNovoId !== UNALLOCATED_ID) {
      updatePlanoFinalRow(planoSheet, headers, rowNovo, productInfo, null); 
      Logger.log(`Movimento SIMPLES: Destino preenchido: ${cleanNovoId} (Linha ${rowNovo}) com ${productCode}`);
    } else if (locNovoId !== UNALLOCATED_ID) {
        Logger.log(`AVISO (Mov. Simples): LocNovo não encontrado para preencher: ${cleanNovoId}.`);
    }

    // 3. Log
    const logAnteriorLabel = locAnteriorId === UNALLOCATED_ID ? LOG_UNALLOCATED_LABEL : cleanAnteriorId;
    const logNovoLabel = locNovoId === UNALLOCATED_ID ? LOG_UNALLOCATED_LABEL : cleanNovoId; 
    
    if ((logAnteriorLabel || logNovoLabel) && locNovoId !== PRANCHETA_ID) {
      const logDateTime = _getLogDateTime(spreadsheetTimeZone);
      appendLogEntries(logSheet, [{
        product_code: productCode,
        location_id_anterior: logAnteriorLabel,
        location_id_novo: logNovoLabel,
        data: logDateTime.data,
        hora: logDateTime.hora,
        motivo: 'MANUAL-REEND',
        usuario: user
      }]);
    } else {
      Logger.log(`Log SIMPLES ignorado (destino Prancheta): ${productCode} de ${logAnteriorLabel} para ${logNovoLabel}`);
    }

    SpreadsheetApp.flush();
    
    // Limpa cache para garantir que dados sejam lidos frescos na próxima leitura
    SCRIPT_CACHE.remove('location_id_map_v2.7');
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');

    return { success: true };
  } catch (e) {
    Logger.log(`ERRO CRÍTICO em saveSingleMove: ${e.message} \n ${e.stack}`);
    SCRIPT_CACHE.remove('location_id_map_v2.7'); SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    return { success: false, error: e.message };
  }
}

/**
 * SALVA MÚLTIPLOS MOVIMENTOS EM LOTE (OTIMIZADO PARA GRANDES VOLUMES)
 */
function saveBatchMoves(moves) {
  try {
    const user = Session.getEffectiveUser().getEmail();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);
    const headers = getHeaders(planoSheet);
    const locationIdToRowMap = getLocationIdToRowMap(planoSheet, headers);
    
    // Preparar dados para escrita em batch
    const updates = new Map(); // Map<rowNumber, {clear: boolean, productInfo: object|null, originalRowData: array|null}>
    const logsToAppend = [];
    const logDateTime = _getLogDateTime(spreadsheetTimeZone);
    const rowsToRead = new Set();
    
    // Primeira passada: identificar todas as linhas que precisam ser lidas
    moves.forEach(move => {
      const { productCode, locAnteriorId, locNovoId, productInfo } = move;
      
      if (locNovoId === PRANCHETA_ID) {
        return; // Ignora movimentos para prancheta
      }
      
      const cleanAnteriorId = locAnteriorId ? locAnteriorId.replace('bin-', '') : null;
      const cleanNovoId = locNovoId ? locNovoId.replace('bin-', '') : null;
      const rowAnterior = cleanAnteriorId ? locationIdToRowMap[cleanAnteriorId] : null;
      const rowNovo = cleanNovoId ? locationIdToRowMap[cleanNovoId] : null;
      
      if (rowAnterior && locAnteriorId !== PRANCHETA_ID && locAnteriorId !== UNALLOCATED_ID) {
        rowsToRead.add(rowAnterior);
      }
      if (rowNovo && locNovoId !== UNALLOCATED_ID) {
        rowsToRead.add(rowNovo);
      }
    });
    
    // Ler todas as linhas necessárias de uma vez (processar em lotes se necessário)
    const originalRowsData = new Map();
    if (rowsToRead.size > 0) {
      const rowsArray = Array.from(rowsToRead).sort((a, b) => a - b);
      // Processar em chunks para evitar problemas com linhas não consecutivas
      const readChunkSize = 500;
      for (let i = 0; i < rowsArray.length; i += readChunkSize) {
        const chunk = rowsArray.slice(i, i + readChunkSize);
        // Para cada chunk, ler as linhas individualmente ou em grupos consecutivos
        chunk.forEach(rowNum => {
          try {
            const rowData = planoSheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
            originalRowsData.set(rowNum, rowData);
          } catch (e) {
            Logger.log(`Erro ao ler linha ${rowNum}: ${e.message}`);
            originalRowsData.set(rowNum, null);
          }
        });
      }
    }
    
    // Segunda passada: processar movimentos
    moves.forEach(move => {
      const { productCode, locAnteriorId, locNovoId, productInfo } = move;
      
      if (locNovoId === PRANCHETA_ID) {
        return; // Ignora movimentos para prancheta
      }
      
      const cleanAnteriorId = locAnteriorId ? locAnteriorId.replace('bin-', '') : null;
      const cleanNovoId = locNovoId ? locNovoId.replace('bin-', '') : null;
      const rowAnterior = cleanAnteriorId ? locationIdToRowMap[cleanAnteriorId] : null;
      const rowNovo = cleanNovoId ? locationIdToRowMap[cleanNovoId] : null;
      
      // Limpar origem
      if (rowAnterior && locAnteriorId !== PRANCHETA_ID && locAnteriorId !== UNALLOCATED_ID) {
        if (!updates.has(rowAnterior)) {
          updates.set(rowAnterior, { clear: true, productInfo: null, originalRowData: originalRowsData.get(rowAnterior) || null });
        } else {
          updates.get(rowAnterior).clear = true;
          updates.get(rowAnterior).productInfo = null;
        }
      }
      
      // Preencher destino
      if (rowNovo && locNovoId !== UNALLOCATED_ID) {
        if (!updates.has(rowNovo)) {
          updates.set(rowNovo, { clear: false, productInfo: productInfo, originalRowData: originalRowsData.get(rowNovo) || null });
        } else {
          updates.get(rowNovo).clear = false;
          updates.get(rowNovo).productInfo = productInfo;
        }
      }
      
      // Preparar log
      const logAnteriorLabel = locAnteriorId === UNALLOCATED_ID ? LOG_UNALLOCATED_LABEL : cleanAnteriorId;
      const logNovoLabel = locNovoId === UNALLOCATED_ID ? LOG_UNALLOCATED_LABEL : cleanNovoId;
      
      if ((logAnteriorLabel || logNovoLabel) && locNovoId !== PRANCHETA_ID) {
        logsToAppend.push({
          product_code: productCode,
          location_id_anterior: logAnteriorLabel,
          location_id_novo: logNovoLabel,
          data: logDateTime.data,
          hora: logDateTime.hora,
          motivo: 'MANUAL-REEND',
          usuario: user
        });
      }
    });
    
    // Executar atualizações em batch
    const rowsToUpdate = Array.from(updates.keys());
    if (rowsToUpdate.length > 0) {
      // Processar em chunks de 100 para evitar timeouts
      const chunkSize = 100;
      for (let i = 0; i < rowsToUpdate.length; i += chunkSize) {
        const chunk = rowsToUpdate.slice(i, i + chunkSize);
        
        // Escrever cada linha individualmente (mais confiável para linhas não consecutivas)
        chunk.forEach(rowNum => {
          try {
            const update = updates.get(rowNum);
            if (update && update.originalRowData && Array.isArray(update.originalRowData)) {
              const newRowData = headers.map((header, index) => 
                buildNewRowValue(header, index, update.productInfo, update.originalRowData, headers)
              );
              planoSheet.getRange(rowNum, 1, 1, headers.length).setValues([newRowData]);
            } else {
              Logger.log(`AVISO: Linha ${rowNum} não pode ser atualizada - dados originais ausentes ou inválidos`);
            }
          } catch (e) {
            const errorMsg = e && e.message ? e.message : (typeof e === 'string' ? e : 'Erro desconhecido');
            Logger.log(`Erro ao atualizar linha ${rowNum}: ${errorMsg}`);
          }
        });
      }
    }
    
    // Adicionar logs em batch
    if (logsToAppend.length > 0) {
      const logChunkSize = 500;
      for (let i = 0; i < logsToAppend.length; i += logChunkSize) {
        const logChunk = logsToAppend.slice(i, i + logChunkSize);
        appendLogEntries(logSheet, logChunk, spreadsheetTimeZone);
      }
    }
    
    SpreadsheetApp.flush();
    
    // Limpar cache
    SCRIPT_CACHE.remove('location_id_map_v2.7');
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    
    Logger.log(`saveBatchMoves: ${moves.length} movimentos processados, ${updates.size} linhas atualizadas, ${logsToAppend.length} logs adicionados`);
    return { success: true, processed: moves.length, updated: updates.size, logsAdded: logsToAppend.length };
  } catch (e) {
    const errorMessage = e && e.message ? e.message : (typeof e === 'string' ? e : 'Erro desconhecido');
    Logger.log(`ERRO CRÍTICO em saveBatchMoves: ${errorMessage} \n ${e.stack || 'Sem stack trace'}`);
    SCRIPT_CACHE.remove('location_id_map_v2.7');
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    return { success: false, error: errorMessage };
  }
}

/**
 * EXECUTA SWAPS DE PRODUTO
 */
function executeSwap(swapInfo) {
  try {
    const user = Session.getEffectiveUser().getEmail();
    const { moveA, moveB } = swapInfo; 

    Logger.log(`Executando SWAP para ${moveA.productCode} (${moveA.locAnteriorId}) <-> ${moveB.productCode} (${moveB.locAnteriorId})`);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);
    const headers = getHeaders(planoSheet);
    const locationIdToRowMap = getLocationIdToRowMap(planoSheet, headers);

    const cleanLocA = moveA.locAnteriorId.replace('bin-', '');
    const cleanLocB = moveB.locAnteriorId.replace('bin-', '');
    const rowA = locationIdToRowMap[cleanLocA];
    const rowB = locationIdToRowMap[cleanLocB];

    if (!rowA || !rowB) throw new Error(`Swap: Linha(s) não encontrada(s): LocA ${cleanLocA} (${rowA}), LocB ${cleanLocB} (${rowB})`);
    if (rowA === rowB) throw new Error(`Swap: Tentativa de swap com a mesma linha: ${rowA}`);

    const rangesToRead = [`A${rowA}:${planoSheet.getLastColumn()}${rowA}`, `A${rowB}:${planoSheet.getLastColumn()}${rowB}`];
    const originalValuesList = planoSheet.getRangeList(rangesToRead).getRanges().map(range => range.getValues()[0]);
    const originalRowDataA = originalValuesList[0];
    const originalRowDataB = originalValuesList[1];
    if (!originalRowDataA || !originalRowDataB || originalRowDataA.length !== headers.length || originalRowDataB.length !== headers.length) {
         throw new Error(`Swap: Falha ao ler dados das linhas ${rowA} ou ${rowB}.`);
    }
    Logger.log(`SWAP: Dados originais lidos para Linha A (${rowA}) e Linha B (${rowB})`);

    const finalRowDataA = headers.map((h, i) => buildNewRowValue(h, i, moveB.productInfo, originalRowDataA, headers)); 
    const finalRowDataB = headers.map((h, i) => buildNewRowValue(h, i, moveA.productInfo, originalRowDataB, headers)); 
    Logger.log(`SWAP: Novos dados construídos para ambas as linhas.`);

    planoSheet.getRange(rowA, 1, 1, headers.length).setValues([finalRowDataA]);
    planoSheet.getRange(rowB, 1, 1, headers.length).setValues([finalRowDataB]);
    SpreadsheetApp.flush();
    Logger.log(`SWAP: Linha A (${rowA}) escrita com Prod B (${moveB.productCode}), Linha B (${rowB}) escrita com Prod A (${moveA.productCode})`);

    const logDateTime = _getLogDateTime(spreadsheetTimeZone);
    appendLogEntries(logSheet, [
      { product_code: moveA.productCode, location_id_anterior: cleanLocA, location_id_novo: cleanLocB, data: logDateTime.data, hora: logDateTime.hora, motivo: 'MANUAL-SWAP', usuario: user },
      { product_code: moveB.productCode, location_id_anterior: cleanLocB, location_id_novo: cleanLocA, data: logDateTime.data, hora: logDateTime.hora, motivo: 'MANUAL-SWAP', usuario: user }
    ]);
    Logger.log(`SWAP: Logs adicionados.`);

    return { success: true };
  } catch (e) {
    Logger.log(`ERRO CRÍTICO em executeSwap: ${e.message} \n ${e.stack}`);
    SCRIPT_CACHE.remove('location_id_map_v2.7'); SCRIPT_CACHE.remove('plano_headers_v2.7');
    return { success: false, error: `Erro no Swap: ${e.message}` };
  }
}

/**
 * ==================================================================
 * INÍCIO: FUNÇÕES DE GERENCIAMENTO (V2.7)
 * ==================================================================
 */

/**
 * NOVA FUNÇÃO (V2.7.3 - Correção de Bug de Cache): Cria um novo equipamento
 */
function createNewEquipment(ruaNum, equipNum, equipType, user) {
  Logger.log(`Iniciando CRIAÇÃO DE EQUIPAMENTO (V2.7.3) para R${ruaNum}-E${equipNum} (Tipo: ${equipType}) por ${user}`);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000); 

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // *** INÍCIO DA CORREÇÃO (V2.7.3 - Cache) ***
    // Força a sincronização e limpa o cache ANTES de ler qualquer dado
    SpreadsheetApp.flush(); 
    SCRIPT_CACHE.remove('location_id_map_v2.7'); 
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    Utilities.sleep(1500); // Dá 1.5s para o Google processar as escritas pendentes (deleções)
    Logger.log("Cache limpo e flush/sleep executados antes da criação.");
    // *** FIM DA CORREÇÃO (V2.7.3 - Cache) ***
    
    const spreadsheetTimeZone = "America/Sao_Paulo";
    
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const cadastroSheet = ss.getSheetByName(NOME_ABA_CADASTRO_EQUIP);
    const volumetriaSheet = ss.getSheetByName(NOME_ABA_VOLUMETRIA);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);
    
    // Define planoHeaders (agora lendo do cache limpo ou recriando)
    const planoHeaders = getHeaders(planoSheet); 

    if (!planoSheet || !cadastroSheet || !volumetriaSheet || !logSheet) {
      throw new Error("Uma ou mais abas necessárias (Plano_Enderecamento_Final, Cadastro_Equipamentos, Volumetria_Equipamentos, Log_Reenderecamento) não foram encontradas.");
    }

    // --- 1. Validar Volumetria ---
    const volumetriaData = getSheetDataAsObjects(volumetriaSheet);
    const tipoVolumetria = volumetriaData.find(row => String(row.tipo_equipamento || '').trim() === equipType);
    
    if (!tipoVolumetria) {
      throw new Error(`Tipo de equipamento "${equipType}" não encontrado na aba "${NOME_ABA_VOLUMETRIA}".`);
    }

    // --- 2. Validar Existência ---
    // *** INÍCIO DA CORREÇÃO (V2.7.3 - Leitura Fresh) ***
    // Usa o planoSheet normal, que agora deve ser "fresh" por causa do flush/sleep/cache clear
    const planoData = planoSheet.getDataRange().getValues();
    // *** FIM DA CORREÇÃO (V2.7.3 - Leitura Fresh) ***
    
    planoData.shift(); // Remove header
    
    const ruaCol = planoHeaders.indexOf('rua_num');
    const equipCol = planoHeaders.indexOf('equipamento_num');
    const galpaoCol = planoHeaders.indexOf('galpao_id');

    if (ruaCol === -1 || equipCol === -1 || galpaoCol === -1) {
      throw new Error("Colunas 'rua_num', 'equipamento_num' ou 'galpao_id' não encontradas no Plano Final.");
    }
    
    let galpaoId = "N/A"; // Padrão
    if (planoData.length > 0) {
      // Tenta encontrar um galpao_id válido na primeira linha de dados
      galpaoId = planoData[0][galpaoCol] || "N/A"; 
    }

    // Verifica se já existe no Plano Final (leitura live de planoData)
    const jaExistePlano = planoData.some(row => 
      parseFloat(row[ruaCol]) === ruaNum && parseFloat(row[equipCol]) === equipNum
    );
    if (jaExistePlano) {
      throw new Error(`Equipamento R${ruaNum}-E${equipNum} já existe no "${NOME_ABA_PLANO_FINAL}".`);
    }

    // Verifica se já existe no Cadastro (leitura live)
    const cadastroData = getSheetDataAsObjects(cadastroSheet);
    const jaExisteCadastro = cadastroData.some(row => 
      parseFloat(row.rua_num) === ruaNum && parseFloat(row.equipamento_num) === equipNum
    );
    if (jaExisteCadastro) {
      Logger.log(`AVISO: Equipamento R${ruaNum}-E${equipNum} já existe no "${NOME_ABA_CADASTRO_EQUIP}", mas não no Plano Final. Prosseguindo...`);
    }

    // --- 3. Gerar Novos Escaninhos (Baseado no Bloco 5 do ORBITA) ---
    Logger.log(`Volumetria encontrada: ${tipoVolumetria.qtd_niveis} níveis, ${tipoVolumetria.qtd_escaninhos_por_nivel} escaninhos/nível`);
    const newBinRows = []; // Array de Arrays para batch append
    const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const prefixo = String(tipoVolumetria.prefixo || '').toUpperCase().trim();
    const ruaStr = `R${ruaNum}`;
    const equipamentoStr = `${prefixo}${String(equipNum).padStart(3, '0')}`;
    
    const qtdNiveis = parseInt(tipoVolumetria.qtd_niveis, 10);
    const qtdEscaninhos = parseInt(tipoVolumetria.qtd_escaninhos_por_nivel, 10);
    const capacidadeL = parseFloat(String(tipoVolumetria.l_por_escaninho || '0').replace(',', '.')) || 0;
    const fatorSeguranca = parseFloat(String(tipoVolumetria.fator_seguranca || '1').replace(',', '.')) || 1;
    const capacidadeRealL = capacidadeL * fatorSeguranca;
    
    const niveisHotZoneStr = String(tipoVolumetria.niveis_hot_zone || '');
    const nivelAlto = String(tipoVolumetria.nivel_alto || '');
    const nivelInferior = String(tipoVolumetria.nivel_inferior || '');

    if (isNaN(qtdNiveis) || isNaN(qtdEscaninhos) || qtdNiveis <= 0 || qtdEscaninhos <= 0) {
      throw new Error(`Volumetria inválida para "${equipType}". Verifique qtd_niveis (${tipoVolumetria.qtd_niveis}) e qtd_escaninhos_por_nivel (${tipoVolumetria.qtd_escaninhos_por_nivel}).`);
    }

    for (let i = 0; i < qtdNiveis; i++) { // i = 0 (base)
      const nivelLetraDisplay = alfabeto[i]; // A, B, C...
      const alturaNumCorrigidaParaId = qtdNiveis - i; // 5, 4, 3...

      for (let j = 0; j < qtdEscaninhos; j++) { // j = 0
        const posicaoNumDisplay = j + 1; // 1, 2, 3...
        const posicaoLetra = alfabeto[j]; // A, B, C...
        
        const sufixoId = `${alturaNumCorrigidaParaId}${posicaoLetra}`; // Ex: 5A (base)
        const location_id = `${galpaoId}-${ruaStr}-${equipamentoStr}-${sufixoId}`;

        const isHotZone = niveisHotZoneStr.includes(nivelLetraDisplay);
        const isNivelAlto = nivelLetraDisplay === nivelAlto;
        const isNivelInferior = nivelLetraDisplay === nivelInferior;

        // Monta a linha baseada nos headers do Plano Final
        const newRow = planoHeaders.map(header => {
          switch (header) {
            case 'location_id': return location_id;
            case 'galpao_id': return galpaoId;
            case 'rua_num': return ruaNum;
            case 'equipamento_num': return equipNum;
            case 'tipo_equipamento': return equipType;
            case 'nivel': return nivelLetraDisplay;
            case 'escaninho_num_no_nivel': return posicaoNumDisplay;
            case 'capacidade_l': return capacidadeRealL;
            case 'tipo_equipamento_final': return equipType; // Assume o tipo final
            case 'is_hot_zone': return isHotZone;
            case 'is_nivel_alto': return isNivelAlto;
            case 'is_nivel_inferior': return isNivelInferior;
            
            case 'modo_do_escaninho': return 'ZONAS'; // Default seguro
            case 'curvas_permitidas_escaninho': return '';
            
            case 'is_pesado': return false;
            case 'is_alto': return false;
            
            default: return null;
          }
        });
        newBinRows.push(newRow);
      }
    }

    // --- 4. Salvar na Planilha ---
    if (newBinRows.length > 0) {
      // 4a. Salva no Plano Final
      planoSheet.getRange(planoSheet.getLastRow() + 1, 1, newBinRows.length, planoHeaders.length).setValues(newBinRows);
      
      // 4b. Salva no Cadastro (só se não existir)
      if (!jaExisteCadastro) {
        try {
          cadastroSheet.appendRow([galpaoId, ruaNum, equipNum, equipType]);
        } catch (e) {
          Logger.log(`AVISO: Falha ao ATUALIZAR "${NOME_ABA_CADASTRO_EQUIP}": ${e.message}. O Plano Final FOI atualizado.`);
        }
      }
      
      // 4c. Salva Log
      const logDateTime = _getLogDateTime(spreadsheetTimeZone);
      appendLogEntries(logSheet, [{
        product_code: `EQUIP-R${ruaNum}E${equipNum}`,
        location_id_anterior: 'CRIADO',
        location_id_novo: `R${ruaNum}-E${equipNum} (${equipType})`,
        data: logDateTime.data,
        hora: logDateTime.hora,
        motivo: 'MANUAL-EQUIP-CREATE',
        usuario: user
      }]);
      
      Logger.log(`Equipamento R${ruaNum}-E${equipNum} com ${newBinRows.length} escaninhos criado com sucesso.`);
    }

    SpreadsheetApp.flush();
    
    // --- 5. Limpar Caches (de novo, para garantir) ---
    SCRIPT_CACHE.remove('location_id_map_v2.7'); 
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    
    const equipId = `R${ruaNum}-E${equipNum}`;
    return { success: true, message: `Equipamento ${equipId} (${equipType}) criado com ${newBinRows.length} escaninhos.` };

  } catch (e) {
    Logger.log(`ERRO CRÍTICO em createNewEquipment: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro no Backend ao criar: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Executa a troca em lote de todos os produtos entre dois equipamentos.
 */
function executeEquipmentSwap(equipA_Id, equipB_Id, user) {
  Logger.log(`Iniciando SWAP DE EQUIPAMENTO V2.4.2 para ${equipA_Id} <-> ${equipB_Id} por ${user}`);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);

    // 1. Ler todos os dados da planilha
    const dataRange = planoSheet.getDataRange();
    const allData = dataRange.getValues();
    const headers = allData.shift(); 
    
    // 2. Encontrar os índices das colunas de identificação e validação
    const ruaColIndex = headers.indexOf('rua_num');
    const equipColIndex = headers.indexOf('equipamento_num');
    const tipoColIndex = headers.indexOf('tipo_equipamento');

    if (ruaColIndex === -1 || equipColIndex === -1 || tipoColIndex === -1) {
      throw new Error("Colunas essenciais (rua_num, equipamento_num, tipo_equipamento) não encontradas.");
    }

    // 3. Parsear IDs (ex: "R1-E1" -> rua=1, equip=1) e encontrar as linhas
    const [ruaA, equipA] = equipA_Id.replace('R','').split('-E').map(Number);
    const [ruaB, equipB] = equipB_Id.replace('R','').split('-E').map(Number);

    const rowsA = []; 
    const rowsB = [];

    allData.forEach((row, index) => {
      const rowRua = parseFloat(row[ruaColIndex]);
      const rowEquip = parseFloat(row[equipColIndex]);

      if (rowRua === ruaA && rowEquip === equipA) {
        rowsA.push({ allDataIndex: index, data: row });
      } else if (rowRua === ruaB && rowEquip === equipB) {
        rowsB.push({ allDataIndex: index, data: row });
      }
    });

    // 4. Validação de Segurança (Backend)
    if (rowsA.length === 0 || rowsB.length === 0) {
      throw new Error(`Equipamento não encontrado. A=${rowsA.length} bins, B=${rowsB.length} bins.`);
    }
    if (rowsA.length !== rowsB.length) {
      throw new Error(`Tamanhos incompatíveis: Equipamento A tem ${rowsA.length} bins, B tem ${rowsB.length} bins.`);
    }
    
    const tipoA = rowsA[0].data[tipoColIndex];
    const tipoB = rowsB[0].data[tipoColIndex];
    if (tipoA !== tipoB) {
      throw new Error(`Tipos incompatíveis: Equipamento A é '${tipoA}', B é '${tipoB}'.`);
    }

    Logger.log(`Validação OK: Trocando ${rowsA.length} bins do tipo '${tipoA}'.`);

    // 5. Preparar dados para escrita em lote
    const newSheetData = allData.map(r => [...r]); 
    const productsToLog = [];

    for (let i = 0; i < rowsA.length; i++) {
      const slotA = rowsA[i]; 
      const slotB = rowsB[i]; 

      const productInfoFromA = _extractProductInfoFromRow(slotA.data, headers);
      const productInfoFromB = _extractProductInfoFromRow(slotB.data, headers);

      const newRowDataForA = headers.map((h, idx) => buildNewRowValue(h, idx, productInfoFromB, slotA.data, headers));
      const newRowDataForB = headers.map((h, idx) => buildNewRowValue(h, idx, productInfoFromA, slotB.data, headers));

      newSheetData[slotA.allDataIndex] = newRowDataForA;
      newSheetData[slotB.allDataIndex] = newRowDataForB;
      
      if (productInfoFromA.product_code !== 'Vazio') {
        productsToLog.push({ code: productInfoFromA.product_code, from: equipA_Id, to: equipB_Id });
      }
      if (productInfoFromB.product_code !== 'Vazio') {
        productsToLog.push({ code: productInfoFromB.product_code, from: equipB_Id, to: equipA_Id });
      }
    }

    // 6. Executar Escrita em Lote (UMA SÓ CHAMADA)
    planoSheet.getRange(2, 1, newSheetData.length, headers.length).setValues(newSheetData);
    Logger.log(`SWAP DE EQUIPAMENTO: ${newSheetData.length} linhas de dados atualizadas na planilha.`);

    // 7. Executar Log em Lote
    if (productsToLog.length > 0) {
      const logDateTime = _getLogDateTime(spreadsheetTimeZone);
      const logEntries = productsToLog.map(p => ({
        product_code: p.code,
        location_id_anterior: p.from,
        location_id_novo: p.to,
        data: logDateTime.data,
        hora: logDateTime.hora,
        motivo: 'MANUAL-EQUIP-SWAP',
        usuario: user
      }));
      appendLogEntries(logSheet, logEntries, spreadsheetTimeZone);
      Logger.log(`SWAP DE EQUIPAMENTO: ${logEntries.length} movimentos logados.`);
    }

    SpreadsheetApp.flush();
    
    // 8. Limpar Caches
    SCRIPT_CACHE.remove('location_id_map_v2.7'); 
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    
    return { success: true, message: `Troca de ${rowsA.length} escaninhos concluída.` };

  } catch (e) {
    Logger.log(`ERRO CRÍTICO em executeEquipmentSwap: ${e.message} \n ${e.stack}`);
    SCRIPT_CACHE.remove('location_id_map_v2.7'); 
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    return { success: false, error: `Erro no Backend: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * V2.7.3 - Deleta um equipamento e seus produtos da planilha E DO CADASTRO
 */
function deleteEquipmentAndProducts(equipId, user) {
  Logger.log(`Iniciando REMOÇÃO DE EQUIPAMENTO (V2.7.3) para ${equipId} por ${user}`);
  
  const lock = LockService.getScriptLock();
  lock.waitLock(15000); 

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);
    const cadastroSheet = ss.getSheetByName(NOME_ABA_CADASTRO_EQUIP);
    if (!planoSheet || !logSheet || !cadastroSheet) {
      throw new Error(`Abas principais não encontradas: Plano_Enderecamento_Final, Log_Reenderecamento, ou Cadastro_Equipamentos`);
    }
    
    // 1. Ler todos os dados da planilha
    const dataRange = planoSheet.getDataRange();
    const allData = dataRange.getValues(); 
    const headers = allData.shift(); 
    
    // 2. Encontrar os índices das colunas de identificação
    const ruaColIndex = headers.indexOf('rua_num');
    const equipColIndex = headers.indexOf('equipamento_num');
    const locIdColIndex = headers.indexOf('location_id');

    if (ruaColIndex === -1 || equipColIndex === -1 || locIdColIndex === -1) {
      throw new Error("Colunas essenciais (rua_num, equipamento_num, location_id) não encontradas.");
    }

    // 3. Parsear IDs (ex: "R1-E1" -> rua=1, equip=1)
    const [ruaNum, equipNum] = equipId.replace('R','').split('-E').map(Number);
    if (isNaN(ruaNum) || isNaN(equipNum)) {
      throw new Error(`ID do equipamento inválido: ${equipId}`);
    }

    const rowsToDelete = [];     
    const rowsToKeep = [];       
    const productsRemoved = [];  
    const logsToAppeand = [];    
    const logDateTime = _getLogDateTime(spreadsheetTimeZone);

    // 4. Iterar pelos dados (exceto header) para separar o que fica e o que sai
    allData.forEach((row, index) => {
      const rowRua = parseFloat(row[ruaColIndex]);
      const rowEquip = parseFloat(row[equipColIndex]);

      if (rowRua === ruaNum && rowEquip === equipNum) {
        // É uma linha para deletar
        rowsToDelete.push({ 
          rowIndex: index + 2,
          data: row 
        });
        
        // Coleta o produto (se houver) para retornar ao frontend
        const productInfo = _extractProductInfoFromRow(row, headers);
        if (productInfo.product_code !== 'Vazio') {
          productsRemoved.push(productInfo.product_code); // Correção de Timeout V2.7.4
          // Adiciona ao Log de Reendereçamento
          logsToAppeand.push({
            product_code: productInfo.product_code,
            location_id_anterior: row[locIdColIndex],
            location_id_novo: LOG_DELETADO_LABEL,
            data: logDateTime.data,
            hora: logDateTime.hora,
            motivo: 'MANUAL-EQUIP-DELETE',
            usuario: user
          });
        }
        
      } else {
        // É uma linha para manter
        rowsToKeep.push(row);
      }
    });

    // 5. Validação
    if (rowsToDelete.length === 0) {
      throw new Error(`Nenhum escaninho encontrado para o equipamento ${equipId}. Nada foi deletado.`);
    }
    
    Logger.log(`Deletando ${rowsToDelete.length} escaninhos. ${productsRemoved.length} produtos encontrados.`);
    
    // *** INÍCIO DA CORREÇÃO DE LOG (V2.7.4) ***
    // Adiciona um log para o PRÓPRIO equipamento, mesmo se estiver vazio.
    // Isso garante que logsToAppeand.length > 0.
    logsToAppeand.push({
        product_code: `EQUIP-${equipId}`,
        location_id_anterior: equipId,
        location_id_novo: LOG_DELETADO_LABEL,
        data: logDateTime.data,
        hora: logDateTime.hora,
        motivo: 'MANUAL-EQUIP-DELETE',
        usuario: user
    });
    // *** FIM DA CORREÇÃO DE LOG (V2.7.4) ***

    // 6. Executar a Deleção (Forma segura: Limpar e Reescrever)
    // 6a. Deleta do Plano Final
    if (planoSheet.getLastRow() > 1) {
      planoSheet.getRange(2, 1, planoSheet.getLastRow() - 1, headers.length).clearContent();
    }
    if (rowsToKeep.length > 0) {
      planoSheet.getRange(2, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
    }
    
    // 6b. Deleta do Cadastro de Equipamentos
    const cadDataRange = cadastroSheet.getDataRange();
    const cadAllData = cadDataRange.getValues();
    const cadHeaders = cadAllData.shift();
    const cadRuaCol = cadHeaders.indexOf('rua_num');
    const cadEquipCol = cadHeaders.indexOf('equipamento_num');
    
    const cadRowsToKeep = [];
    cadAllData.forEach(row => {
        if (parseFloat(row[cadRuaCol]) !== ruaNum || parseFloat(row[cadEquipCol]) !== equipNum) {
            cadRowsToKeep.push(row);
        }
    });
    
    if (cadastroSheet.getLastRow() > 1) {
        cadastroSheet.getRange(2, 1, cadastroSheet.getLastRow() - 1, cadHeaders.length).clearContent();
    }
    if (cadRowsToKeep.length > 0) {
        cadastroSheet.getRange(2, 1, cadRowsToKeep.length, cadHeaders.length).setValues(cadRowsToKeep);
    }
    Logger.log(`Linha do equipamento ${equipId} removida do Cadastro_Equipamentos.`);

    // 7. Salvar Logs
    if (logsToAppeand.length > 0) {
      appendLogEntries(logSheet, logsToAppeand, spreadsheetTimeZone);
    }

    SpreadsheetApp.flush();
    
    // 8. Limpar Caches
    SCRIPT_CACHE.remove('location_id_map_v2.7'); 
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    
    Logger.log(`Remoção do equipamento ${equipId} concluída. ${rowsToDelete.length} linhas deletadas.`);

    // 9. Retornar os produtos que foram removidos
    return { success: true, productsRemoved: productsRemoved, message: `${rowsToDelete.length} escaninhos deletados.` };

  } catch (e) {
    Logger.log(`ERRO CRÍTICO em deleteEquipmentAndProducts: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro no Backend ao deletar: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Altera o tipo de um equipamento existente.
 * Se recolherProdutos = true, limpa produtos e loga como NAO ALOCADO.
 */
function changeEquipmentType(equipId, newType, recolherProdutos) {
  Logger.log(`Iniciando changeEquipmentType: ${equipId} -> ${newType} (recolher=${recolherProdutos})`);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const user = Session.getEffectiveUser().getEmail();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const logDateTime = _getLogDateTime(spreadsheetTimeZone);

    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const cadastroSheet = ss.getSheetByName(NOME_ABA_CADASTRO_EQUIP);
    const volumetriaSheet = ss.getSheetByName(NOME_ABA_VOLUMETRIA);
    const logSheet = ss.getSheetByName(NOME_ABA_LOG_REEND);

    if (!planoSheet || !cadastroSheet || !volumetriaSheet || !logSheet) {
      throw new Error("Abas principais não encontradas para changeEquipmentType.");
    }

    const volumetriaData = getSheetDataAsObjects(volumetriaSheet);
    const tipoVolumetria = volumetriaData.find(row =>
      String(row.tipo_equipamento || '').trim().toLowerCase() === String(newType || '').trim().toLowerCase()
    );
    if (!tipoVolumetria) {
      throw new Error(`Tipo "${newType}" não encontrado na Volumetria_Equipamentos.`);
    }

    const qtdNiveis = parseInt(tipoVolumetria.qtd_niveis, 10);
    const qtdEscaninhosPorNivel = parseInt(tipoVolumetria.qtd_escaninhos_por_nivel, 10);
    if (isNaN(qtdNiveis) || isNaN(qtdEscaninhosPorNivel) || qtdNiveis <= 0 || qtdEscaninhosPorNivel <= 0) {
      throw new Error("Volumetria inválida para o tipo selecionado.");
    }

    const capacidadeL = parseFloat(String(tipoVolumetria.l_por_escaninho || '0').replace(',', '.')) || 0;
    const fatorSeguranca = parseFloat(String(tipoVolumetria.fator_seguranca || '1').replace(',', '.')) || 1;
    const capacidadeRealL = capacidadeL * fatorSeguranca;
    const niveisHotZoneStr = String(tipoVolumetria.niveis_hot_zone || '');
    const nivelAlto = String(tipoVolumetria.nivel_alto || '');
    const nivelInferior = String(tipoVolumetria.nivel_inferior || '');
    const prefixo = String(tipoVolumetria.prefixo || '').toUpperCase().trim();
    const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const headers = getHeaders(planoSheet);
    const data = planoSheet.getDataRange().getValues();
    const headerRow = data.shift();

    const ruaCol = headers.indexOf('rua_num');
    const equipCol = headers.indexOf('equipamento_num');
    const locIdCol = headers.indexOf('location_id');
    const productCol = headers.indexOf('product_code');
    const tipoCol = headers.indexOf('tipo_equipamento');
    const tipoFinalCol = headers.indexOf('tipo_equipamento_final');
    const nivelCol = headers.indexOf('nivel');
    const escaninhoCol = headers.indexOf('escaninho_num_no_nivel');
    const galpaoCol = headers.indexOf('galpao_id');
    const capacidadeCol = headers.indexOf('capacidade_l');
    const hotZoneCol = headers.indexOf('is_hot_zone');
    const nivelAltoCol = headers.indexOf('is_nivel_alto');
    const nivelInferiorCol = headers.indexOf('is_nivel_inferior');

    if (ruaCol === -1 || equipCol === -1 || locIdCol === -1 || productCol === -1 || tipoCol === -1 || tipoFinalCol === -1) {
      throw new Error("Colunas essenciais não encontradas no Plano_Enderecamento_Final.");
    }

    const [ruaNum, equipNum] = equipId.replace('R', '').split('-E').map(Number);
    if (isNaN(ruaNum) || isNaN(equipNum)) {
      throw new Error(`ID do equipamento inválido: ${equipId}`);
    }

    const equipRows = [];
    data.forEach((row, idx) => {
      const rowRua = parseFloat(row[ruaCol]);
      const rowEquip = parseFloat(row[equipCol]);
      if (rowRua === ruaNum && rowEquip === equipNum) {
        equipRows.push({ rowNumber: idx + 2, rowData: row });
      }
    });
    if (equipRows.length === 0) {
      throw new Error(`Equipamento ${equipId} não encontrado no Plano_Enderecamento_Final.`);
    }

    const totalAtual = equipRows.length;
    const totalNovo = qtdNiveis * qtdEscaninhosPorNivel;
    const galpaoId = equipRows[0].rowData[galpaoCol] || 'LJ000000';
    const ruaStr = `R${ruaNum}`;
    const equipamentoStr = `${prefixo}${String(equipNum).padStart(3, '0')}`;

    const logsToAppend = [];

    // Atualizar linhas existentes (tipo, capacidade, flags e opcionalmente limpar produtos)
    equipRows.forEach(({ rowNumber, rowData }) => {
      const produto = String(rowData[productCol] || '').trim();
      const nivel = String(rowData[nivelCol] || '').trim();
      const isHotZone = niveisHotZoneStr.includes(nivel);
      const isNivelAlto = nivel === nivelAlto;
      const isNivelInferior = nivel === nivelInferior;

      let newRowData = rowData.slice();
      if (recolherProdutos && produto && produto !== 'Vazio') {
        newRowData = headers.map((h, i) => buildNewRowValue(h, i, null, rowData, headers));
        logsToAppend.push({
          product_code: produto,
          location_id_anterior: rowData[locIdCol],
          location_id_novo: LOG_UNALLOCATED_LABEL,
          data: logDateTime.data,
          hora: logDateTime.hora,
          motivo: 'MANUAL-CHANGE-TYPE',
          usuario: user
        });
      }

      newRowData[tipoCol] = newType;
      newRowData[tipoFinalCol] = newType;
      if (capacidadeCol >= 0) newRowData[capacidadeCol] = capacidadeRealL;
      if (hotZoneCol >= 0) newRowData[hotZoneCol] = isHotZone;
      if (nivelAltoCol >= 0) newRowData[nivelAltoCol] = isNivelAlto;
      if (nivelInferiorCol >= 0) newRowData[nivelInferiorCol] = isNivelInferior;

      planoSheet.getRange(rowNumber, 1, 1, headers.length).setValues([newRowData]);
    });

    SpreadsheetApp.flush();

    // Remover escaninhos extras (se reduzir)
    if (totalNovo < totalAtual) {
      const remover = totalAtual - totalNovo;
      const emptyRows = equipRows.filter(r => {
        const pc = String(r.rowData[productCol] || '').trim();
        return !pc || pc === 'Vazio';
      }).map(r => r.rowNumber);

      if (!recolherProdutos && emptyRows.length < remover) {
        throw new Error(`Nao ha escaninhos vazios suficientes para reduzir (${remover} necessários).`);
      }

      const rowsToDelete = recolherProdutos
        ? equipRows.map(r => r.rowNumber).slice(-remover)
        : emptyRows.slice(-remover);

      rowsToDelete.sort((a, b) => b - a).forEach(rowNum => planoSheet.deleteRow(rowNum));
    }

    // Adicionar escaninhos faltantes (se aumentar)
    if (totalNovo > totalAtual) {
      const toAdd = totalNovo - totalAtual;
      const existingLocs = new Set();
      const dataAfter = planoSheet.getDataRange().getValues();
      dataAfter.shift();
      dataAfter.forEach(row => {
        const rowRua = parseFloat(row[ruaCol]);
        const rowEquip = parseFloat(row[equipCol]);
        if (rowRua === ruaNum && rowEquip === equipNum) {
          const locId = String(row[locIdCol] || '').trim();
          if (locId) existingLocs.add(locId);
        }
      });

      const newRows = [];
      for (let i = 0; i < qtdNiveis; i++) {
        const nivelLetra = alfabeto[i];
        const alturaNum = qtdNiveis - i;
        for (let j = 0; j < qtdEscaninhosPorNivel; j++) {
          if (newRows.length >= toAdd) break;
          const posicaoNum = j + 1;
          const posicaoLetra = alfabeto[j];
          const sufixoId = `${alturaNum}${posicaoLetra}`;
          const locationId = `${galpaoId}-${ruaStr}-${equipamentoStr}-${sufixoId}`;
          if (existingLocs.has(locationId)) continue;

          const isHotZone = niveisHotZoneStr.includes(nivelLetra);
          const isNivelAlto = nivelLetra === nivelAlto;
          const isNivelInferior = nivelLetra === nivelInferior;

          const newRow = headers.map(h => {
            switch (h) {
              case 'location_id': return locationId;
              case 'galpao_id': return galpaoId;
              case 'rua_num': return ruaNum;
              case 'equipamento_num': return equipNum;
              case 'tipo_equipamento': return newType;
              case 'tipo_equipamento_final': return newType;
              case 'nivel': return nivelLetra;
              case 'escaninho_num_no_nivel': return posicaoNum;
              case 'capacidade_l': return capacidadeRealL;
              case 'is_hot_zone': return isHotZone;
              case 'is_nivel_alto': return isNivelAlto;
              case 'is_nivel_inferior': return isNivelInferior;
              case 'product_code': return 'Vazio';
              default: return null;
            }
          });
          newRows.push(newRow);
          existingLocs.add(locationId);
        }
        if (newRows.length >= toAdd) break;
      }

      if (newRows.length > 0) {
        planoSheet.getRange(planoSheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
      }
    }

    // Atualizar Cadastro_Equipamentos
    const cadData = cadastroSheet.getDataRange().getValues();
    const cadHeaders = cadData.shift();
    const cadRuaCol = cadHeaders.indexOf('rua_num');
    const cadEquipCol = cadHeaders.indexOf('equipamento_num');
    const cadTipoCol = cadHeaders.indexOf('tipo_equipamento');
    if (cadRuaCol !== -1 && cadEquipCol !== -1 && cadTipoCol !== -1) {
      cadData.forEach((row, idx) => {
        if (parseFloat(row[cadRuaCol]) === ruaNum && parseFloat(row[cadEquipCol]) === equipNum) {
          row[cadTipoCol] = newType;
          cadastroSheet.getRange(idx + 2, 1, 1, cadHeaders.length).setValues([row]);
        }
      });
    }

    if (logsToAppend.length > 0) {
      appendLogEntries(logSheet, logsToAppend, spreadsheetTimeZone);
    }

    SpreadsheetApp.flush();
    SCRIPT_CACHE.remove('location_id_map_v2.7');
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');

    return { success: true, message: `Tipo do equipamento ${equipId} alterado para "${newType}".` };
  } catch (e) {
    Logger.log(`ERRO em changeEquipmentType: ${e.message} \n ${e.stack}`);
    SCRIPT_CACHE.remove('location_id_map_v2.7');
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Extrai apenas as colunas de PRODUTO de um array de linha.
 */
function _extractProductInfoFromRow(rowData, headers) {
  const productInfo = {};
  
  const productColumns = [
    'product_code', 'produto_alocado_code', 'product_name', 'curva', 'grupo', 'grupo_alocado',
    'categoria_armazenagem', 'vol_l_unitario', 'vol_L_unitario', 'quantidade', 'venda_total',
    'nm_fabricante', 'altura_cm', 'peso_kg_unitario', 'subcategoria', 'is_pesado', 'is_alto'
  ];
  
  const productColumnSet = new Set(productColumns);

  headers.forEach((header, index) => {
    if (productColumnSet.has(header)) {
      productInfo[header] = (index < rowData.length) ? rowData[index] : null;
    }
  });

  if (!productInfo.product_code && productInfo.produto_alocado_code) {
    productInfo.product_code = productInfo.produto_alocado_code;
  }
  if (!productInfo.product_code) {
    productInfo.product_code = 'Vazio'; 
  }
  
  return productInfo;
}

/**
 * ==================================================================
 * FIM: FUNÇÕES DE GERENCIAMENTO (V2.7)
 * ==================================================================
 */

/**
 * ==================================================================
 * INÍCIO: FUNÇÃO DE RELATÓRIO V2.8
 * ==================================================================
 */

/**
 * Gera um relatório de SKUs alocados e não alocados em uma nova planilha.
 */
function generateSkuReport() {
  Logger.log("Iniciando Geração de Relatório de SKUs V2.8 (mesmo arquivo)...");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ssName = ss.getName();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const nowStr = Utilities.formatDate(new Date(), spreadsheetTimeZone, "yyyy-MM-dd HH:mm");

    // 1. Usar a planilha atual (evita escopo extra). Iremos criar/atualizar abas locais.
    
    // 2. Definir as abas e tipos
    const reportConfig = [
      { name: "Refrigerados", types: ['geladeira', 'geladeira_alta', 'geladeira_americana'] },
      { name: "Congelados", types: ['freezer'] },
      { name: "Secos", types: ['prateleira', 'prateleira lateral'] },
      { name: "Nao Alocados", types: [] } // Tipos vazios, tratado separadamente
    ];
    const headers = ["codigo_sku", "descricao", "endereco", "tipo_equipamento", "categoria_armazenagem"];

    // 3. Buscar os dados necessários (sem cache para garantir dados frescos)
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const baseProdutosSheet = ss.getSheetByName(NOME_ABA_BASE_PRODUTOS);

    if (!planoSheet || !baseProdutosSheet) {
      throw new Error("Não foi possível encontrar as abas 'Plano_Enderecamento_Final' ou 'Base_Produtos'.");
    }

    const planoData = getSheetDataAsObjects(planoSheet);
    const baseProdutosData = getSheetDataAsObjects(baseProdutosSheet);

    // 4. Criar Mapa de Produtos da Base
    const baseProdutosMap = new Map();
    baseProdutosData.forEach(row => {
      if(row.product_code) {
        const normalizedCode = String(row.product_code).trim();
        if(normalizedCode) baseProdutosMap.set(normalizedCode, row);
      }
    });
    Logger.log(`Relatório: Mapa da Base_Produtos criado com ${baseProdutosMap.size} itens.`);

    const alocatedProductCodes = new Set();
    const reportData = { "Refrigerados": [], "Congelados": [], "Secos": [], "Nao Alocados": [] };

    // 5. Processar SKUs Alocados
    planoData.forEach(row => {
      const pCode = String(row.product_code || '').trim();
      if (!pCode || pCode === 'Vazio') return;

      alocatedProductCodes.add(pCode);
      const productInfo = baseProdutosMap.get(pCode) || {};
      const tipoEquip = String(row.tipo_equipamento_final || row.tipo_equipamento || 'N/A').trim();

      const newRow = [
        pCode,
        productInfo.product_name || row.product_name || 'Produto sem nome',
        row.location_id || 'N/A',
        tipoEquip,
        productInfo.categoria_armazenagem || row.categoria_armazenagem || 'N/A'
      ];

      let added = false;
      for (const config of reportConfig) {
        if (config.types.includes(tipoEquip)) {
          reportData[config.name].push(newRow);
          added = true;
          break;
        }
      }
      // Não logamos SKUs não mapeados para não poluir o log, eles simplesmente não aparecem
    });
    Logger.log(`Relatório: ${alocatedProductCodes.size} SKUs alocados processados.`);

    // 6. Processar SKUs Não Alocados
    baseProdutosMap.forEach((productInfo, pCode) => {
      if (!alocatedProductCodes.has(pCode)) {
        const newRow = [
          pCode,
          productInfo.product_name || 'Produto sem nome',
          'N/A',
          'N/A',
          productInfo.categoria_armazenagem || 'N/A'
        ];
        reportData["Nao Alocados"].push(newRow);
      }
    });
    Logger.log(`Relatório: ${reportData["Nao Alocados"].length} SKUs não alocados processados.`);

    // 7. Escrever dados em abas locais (criando/limpando se necessário)
    const createdSheets = [];
    reportConfig.forEach((config, index) => {
      const sheetName = `Relatório SKUs - ${config.name}`;
      const data = reportData[config.name];
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      } else {
        sheet.clear();
      }
      createdSheets.push(sheet);

      // Adicionar Cabeçalhos
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

      // Adicionar Dados
      if (data.length > 0) {
        sheet.getRange(2, 1, data.length, headers.length).setValues(data);
      }
      
      // Auto-ajustar colunas
      headers.forEach((h, i) => sheet.autoResizeColumn(i + 1));
    });

    // 8. Retornar URL apontando para a primeira aba criada
    const firstSheet = createdSheets[0] || ss.getActiveSheet();
    const reportUrl = ss.getUrl() + `#gid=${firstSheet.getSheetId()}`;
    Logger.log(`Relatório de SKUs gerado com sucesso nas abas locais. URL: ${reportUrl}`);

    return { success: true, url: reportUrl };

  } catch (e) {
    Logger.log(`ERRO CRÍTICO em generateSkuReport: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro no Backend ao gerar relatório: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}


/**
 * ==================================================================
 * FUNÇÃO DE RELATÓRIO CUSTOMIZADO V2.9
 * ==================================================================
 */
function generateSkuReportCustom(destination, abas, colunas) {
  if (!IS_TESTING_MODE) Logger.log("Iniciando Geração de Relatório Customizado...");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetTimeZone = "America/Sao_Paulo";
    const nowStr = Utilities.formatDate(new Date(), spreadsheetTimeZone, "yyyy-MM-dd HH:mm");

    // Mapear abas para tipos de equipamento e filtros
    const abaMap = {
      'refrigerados': { name: "Refrigerados", types: ['geladeira', 'geladeira_alta', 'geladeira_americana'], filter: null },
      'congelados': { name: "Congelados", types: ['freezer'], filter: null },
      'secos': { name: "Secos", types: ['prateleira', 'prateleira lateral'], filter: null },
      'nao-alocados': { name: "Nao Alocados", types: [], filter: null },
      'altos': { name: "Produtos Altos", types: null, filter: { is_alto: true } },
      'pesados': { name: "Produtos Pesados", types: null, filter: { is_pesado: true } },
      'pequenos': { name: "Produtos Pequenos", types: null, filter: { is_pequeno: true } },
      'frageis': { name: "Produtos Frágeis", types: null, filter: { is_fragil: 'SIM' } },
      'degelo-nao': { name: "Degelo = NÃO", types: null, filter: { degelo: 'NAO' } },
      'curva-a': { name: "Curva A", types: null, filter: { curva: 'A' } },
      'curva-b': { name: "Curva B", types: null, filter: { curva: 'B' } },
      'curva-c': { name: "Curva C", types: null, filter: { curva: 'C' } },
      'curva-d': { name: "Curva D", types: null, filter: { curva: 'D' } },
      'curva-e': { name: "Curva E", types: null, filter: { curva: 'E' } },
      'curva-cd': { name: "Curva C+D", types: null, filter: { curva: ['C', 'D'] } },
      'sem-curva': { name: "Sem Curva", types: null, filter: { curva: null } },
      'grupo-quimicos': { name: "Grupo: Químicos", types: null, filter: { grupo: 'quimicos' } },
      'grupo-perfumaria': { name: "Grupo: Perfumaria", types: null, filter: { grupo: 'perfumaria' } },
      'grupo-alimento': { name: "Grupo: Alimento", types: null, filter: { grupo: 'alimento' } },
      'grupo-flvs': { name: "Grupo: FLVs", types: null, filter: { grupo: 'flvs' } },
      'grupo-bebidas': { name: "Grupo: Bebidas", types: null, filter: { grupo: 'bebidas' } },
      'grupo-neutro': { name: "Grupo: Neutro", types: null, filter: { grupo: 'neutro' } }
    };

    // Mapear colunas para índices
    const colunaMap = {
      'codigo_sku': 0,
      'descricao': 1,
      'endereco': 2,
      'tipo_equipamento': 3,
      'categoria_armazenagem': 4,
      'curva': 5,
      'grupo': 6,
      'fabricante': 7,
      'quantidade': 8,
      'alto': 9,
      'pesado': 10,
      'pequeno': 11,
      'fragil': 12,
      'degelo': 13,
      'altura': 14,
      'peso': 15,
      'volume': 16,
      'subcategoria': 17,
      'vendas': 18
    };

    // Definir headers baseado nas colunas selecionadas
    const headers = colunas.map(col => {
      const map = {
        'codigo_sku': 'codigo_sku',
        'descricao': 'descricao',
        'endereco': 'endereco',
        'tipo_equipamento': 'tipo_equipamento',
        'categoria_armazenagem': 'categoria_armazenagem',
        'curva': 'curva',
        'grupo': 'grupo',
        'fabricante': 'fabricante',
        'quantidade': 'quantidade',
        'alto': 'alto',
        'pesado': 'pesado',
        'pequeno': 'pequeno',
        'fragil': 'fragil',
        'degelo': 'degelo',
        'altura': 'altura_cm',
        'peso': 'peso_kg_unitario',
        'volume': 'vol_l_unitario',
        'subcategoria': 'subcategoria',
        'vendas': 'venda_total'
      };
      return map[col] || col;
    });

    // Buscar dados
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const baseProdutosSheet = ss.getSheetByName(NOME_ABA_BASE_PRODUTOS);

    if (!planoSheet || !baseProdutosSheet) {
      throw new Error("Não foi possível encontrar as abas necessárias.");
    }

    const planoData = getSheetDataAsObjects(planoSheet);
    const baseProdutosData = getSheetDataAsObjects(baseProdutosSheet);

    // Criar mapa de produtos
    const baseProdutosMap = new Map();
    baseProdutosData.forEach(row => {
      if(row.product_code) {
        const normalizedCode = String(row.product_code).trim();
        if(normalizedCode) baseProdutosMap.set(normalizedCode, row);
      }
    });

    const alocatedProductCodes = new Set();
    const reportData = {};

    // Inicializar dados das abas selecionadas
    abas.forEach(aba => {
      if (abaMap[aba]) {
        reportData[abaMap[aba].name] = [];
      }
    });

    // Processar SKUs Alocados
    planoData.forEach(row => {
      const pCode = String(row.product_code || '').trim();
      if (!pCode || pCode === 'Vazio') return;

      alocatedProductCodes.add(pCode);
      const productInfo = baseProdutosMap.get(pCode) || {};
      const tipoEquip = String(row.tipo_equipamento_final || row.tipo_equipamento || 'N/A').trim();

      // Determinar se é alto, pesado, pequeno
      const altura = productInfo.altura_cm || row.altura_cm || null;
      const peso = productInfo.peso_kg_unitario || row.peso_kg_unitario || null;
      const isAlto = productInfo.is_alto !== undefined ? _parseBooleanFlag(productInfo.is_alto) : _parseBooleanFlag(row.is_alto);
      const isPesado = productInfo.is_pesado !== undefined ? _parseBooleanFlag(productInfo.is_pesado) : _parseBooleanFlag(row.is_pesado);
      const isPequeno = productInfo.is_pequeno !== undefined ? _parseBooleanFlag(productInfo.is_pequeno) : _parseBooleanFlag(row.is_pequeno);
      const isFragil = productInfo.is_fragil || row.is_fragil || 'N/A';
      const degelo = productInfo.degelo || row.degelo || 'N/A';
      const volL = productInfo.vol_l_unitario || row.vol_l_unitario || productInfo.vol_L_unitario || row.vol_L_unitario || null;
      const vendaTotal = productInfo.venda_total || row.venda_total || null;
      
      // Construir linha com todas as colunas possíveis
      const fullRow = [
        pCode, // codigo_sku
        productInfo.product_name || row.product_name || 'Produto sem nome', // descricao
        row.location_id || 'N/A', // endereco
        tipoEquip, // tipo_equipamento
        productInfo.categoria_armazenagem || row.categoria_armazenagem || 'N/A', // categoria_armazenagem
        productInfo.curva || row.curva || 'N/A', // curva
        productInfo.grupo || row.grupo || 'N/A', // grupo
        productInfo.nm_fabricante || row.nm_fabricante || 'N/A', // fabricante
        row.quantidade || productInfo.quantidade || 'N/A', // quantidade
        isAlto ? 'SIM' : 'NÃO', // alto
        isPesado ? 'SIM' : 'NÃO', // pesado
        isPequeno ? 'SIM' : 'NÃO', // pequeno
        isFragil || 'N/A', // fragil
        degelo || 'N/A', // degelo
        altura !== null && altura !== undefined ? altura : 'N/A', // altura
        peso !== null && peso !== undefined ? peso : 'N/A', // peso
        volL !== null && volL !== undefined ? volL : 'N/A', // volume
        productInfo.subcategoria || row.subcategoria || 'N/A', // subcategoria
        vendaTotal !== null && vendaTotal !== undefined ? vendaTotal : 'N/A' // vendas
      ];

      // Filtrar apenas colunas selecionadas
      const filteredRow = colunas.map(col => fullRow[colunaMap[col]]);

      // Adicionar à aba apropriada
      for (const aba of abas) {
        const config = abaMap[aba];
        if (!config) continue;
        
        let shouldInclude = false;
        
        // Se tem filtro, aplicar filtro
        if (config.filter) {
          const filter = config.filter;
          if (filter.is_alto !== undefined && filter.is_alto !== isAlto) continue;
          if (filter.is_pesado !== undefined && filter.is_pesado !== isPesado) continue;
          if (filter.is_pequeno !== undefined && filter.is_pequeno !== isPequeno) continue;
          if (filter.is_fragil !== undefined) {
            const fragilValue = String(isFragil || '').trim().toUpperCase();
            if (filter.is_fragil === 'SIM' && fragilValue !== 'SIM') continue;
          }
          if (filter.degelo !== undefined) {
            const degeloValue = String(degelo || '').trim().toUpperCase();
            if (filter.degelo === 'NAO' && degeloValue !== 'NAO') continue;
          }
          if (filter.curva !== undefined) {
            const curvaValue = String(productInfo.curva || row.curva || '').trim().toUpperCase();
            if (Array.isArray(filter.curva)) {
              const curvasPermitidas = filter.curva.map(item => String(item).trim().toUpperCase());
              if (!curvasPermitidas.includes(curvaValue)) continue;
            } else if (filter.curva === null) {
              if (curvaValue !== '' && curvaValue !== 'N/A') continue;
            } else {
              if (curvaValue !== filter.curva.toUpperCase()) continue;
            }
          }
          if (filter.grupo !== undefined) {
            const grupoValue = String(productInfo.grupo || row.grupo || '').trim().toLowerCase();
            if (grupoValue !== filter.grupo.toLowerCase()) continue;
          }
          shouldInclude = true;
        } else if (config.types) {
          // Se tem types, verificar tipo de equipamento
          if (config.types.includes(tipoEquip)) {
            shouldInclude = true;
          }
        } else if (aba === 'nao-alocados') {
          // Não alocados já é tratado separadamente
          continue;
        }
        
        if (shouldInclude) {
          reportData[config.name].push(filteredRow);
          break; // Um produto só vai para uma aba
        }
      }
    });

    // Processar SKUs Não Alocados e outros filtros que podem incluir não alocados
    const processedNonAllocated = new Set();
    
    baseProdutosMap.forEach((productInfo, pCode) => {
      const isAllocated = alocatedProductCodes.has(pCode);
      
      // Determinar propriedades
      const altura = productInfo.altura_cm || null;
      const peso = productInfo.peso_kg_unitario || null;
      const isAlto = productInfo.is_alto !== undefined ? _parseBooleanFlag(productInfo.is_alto) : false;
      const isPesado = productInfo.is_pesado !== undefined ? _parseBooleanFlag(productInfo.is_pesado) : false;
      const isPequeno = productInfo.is_pequeno !== undefined ? _parseBooleanFlag(productInfo.is_pequeno) : false;
      const isFragil = productInfo.is_fragil || 'N/A';
      const degelo = productInfo.degelo || 'N/A';
      const volL = productInfo.vol_l_unitario || productInfo.vol_L_unitario || null;
      const vendaTotal = productInfo.venda_total || null;
      const curva = productInfo.curva || '';
      const grupo = productInfo.grupo || '';
      
      const fullRow = [
        pCode,
        productInfo.product_name || 'Produto sem nome',
        isAllocated ? (planoData.find(r => String(r.product_code || '').trim() === pCode)?.location_id || 'N/A') : 'N/A',
        isAllocated ? (planoData.find(r => String(r.product_code || '').trim() === pCode)?.tipo_equipamento_final || 'N/A') : 'N/A',
        productInfo.categoria_armazenagem || 'N/A',
        curva || 'N/A',
        grupo || 'N/A',
        productInfo.nm_fabricante || 'N/A',
        productInfo.quantidade || 'N/A',
        isAlto ? 'SIM' : 'NÃO',
        isPesado ? 'SIM' : 'NÃO',
        isPequeno ? 'SIM' : 'NÃO',
        isFragil || 'N/A',
        degelo || 'N/A',
        altura !== null && altura !== undefined ? altura : 'N/A',
        peso !== null && peso !== undefined ? peso : 'N/A',
        volL !== null && volL !== undefined ? volL : 'N/A',
        productInfo.subcategoria || 'N/A',
        vendaTotal !== null && vendaTotal !== undefined ? vendaTotal : 'N/A'
      ];
      const filteredRow = colunas.map(col => fullRow[colunaMap[col]]);
      
      // Verificar cada aba selecionada
      for (const aba of abas) {
        const config = abaMap[aba];
        if (!config) continue;
        
        let shouldInclude = false;
        
        if (aba === 'nao-alocados' && !isAllocated) {
          shouldInclude = true;
        } else if (config.filter) {
          // Aplicar filtros (pode incluir alocados e não alocados)
          const filter = config.filter;
          if (filter.is_alto !== undefined && filter.is_alto !== isAlto) continue;
          if (filter.is_pesado !== undefined && filter.is_pesado !== isPesado) continue;
          if (filter.is_pequeno !== undefined && filter.is_pequeno !== isPequeno) continue;
          if (filter.is_fragil !== undefined) {
            const fragilValue = String(isFragil || '').trim().toUpperCase();
            if (filter.is_fragil === 'SIM' && fragilValue !== 'SIM') continue;
          }
          if (filter.degelo !== undefined) {
            const degeloValue = String(degelo || '').trim().toUpperCase();
            if (filter.degelo === 'NAO' && degeloValue !== 'NAO') continue;
          }
          if (filter.curva !== undefined) {
            const curvaValue = String(curva || '').trim().toUpperCase();
            if (Array.isArray(filter.curva)) {
              const curvasPermitidas = filter.curva.map(item => String(item).trim().toUpperCase());
              if (!curvasPermitidas.includes(curvaValue)) continue;
            } else if (filter.curva === null) {
              if (curvaValue !== '' && curvaValue !== 'N/A') continue;
            } else {
              if (curvaValue !== filter.curva.toUpperCase()) continue;
            }
          }
          if (filter.grupo !== undefined) {
            const grupoValue = String(grupo || '').trim().toLowerCase();
            if (grupoValue !== filter.grupo.toLowerCase()) continue;
          }
          shouldInclude = true;
        }
        
        if (shouldInclude && !processedNonAllocated.has(pCode + '-' + aba)) {
          reportData[config.name].push(filteredRow);
          processedNonAllocated.add(pCode + '-' + aba);
          break; // Um produto só vai para uma aba por vez
        }
      }
    });

    // Criar planilha de destino
    let targetSpreadsheet = ss;
    let isNewSpreadsheet = false;

    if (destination === 'new') {
      // Gerar CSV diretamente
      let csvContent = '';
      
      abas.forEach((aba, index) => {
        const config = abaMap[aba];
        if (!config) return;
        
        const sheetName = `Relatório SKUs - ${config.name}`;
        const data = reportData[config.name] || [];
        
        if (index > 0) csvContent += '\n\n';
        csvContent += `=== ${sheetName} ===\n`;
        
        // Adicionar cabeçalhos
        csvContent += headers.map(h => {
          if (h.includes(',') || h.includes('"') || h.includes('\n')) {
            return '"' + h.replace(/"/g, '""') + '"';
          }
          return h;
        }).join(',') + '\n';
        
        // Adicionar dados
        data.forEach(row => {
          csvContent += row.map(cell => {
            const value = cell === null || cell === undefined ? '' : String(cell);
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
          }).join(',') + '\n';
        });
      });
      
      return {
        success: true,
        csvContent: csvContent,
        filename: `Relatorio_SKUs_${nowStr.replace(/[:\s]/g, '_')}.csv`
      };
    }

    // Escrever dados na planilha atual
    const createdSheets = [];
    abas.forEach(aba => {
      const config = abaMap[aba];
      if (!config) return;

      const sheetName = `Relatório SKUs - ${config.name}`;
      const data = reportData[config.name] || [];
      
      let sheet = targetSpreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        sheet = targetSpreadsheet.insertSheet(sheetName);
      } else {
        sheet.clear();
      }
      createdSheets.push(sheet);

      // Adicionar cabeçalhos
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

      // Adicionar dados
      if (data.length > 0) {
        sheet.getRange(2, 1, data.length, headers.length).setValues(data);
      }

      // Auto-ajustar colunas
      headers.forEach((h, i) => sheet.autoResizeColumn(i + 1));
    });

    const firstSheet = createdSheets[0] || targetSpreadsheet.getActiveSheet();
    const reportUrl = targetSpreadsheet.getUrl() + `#gid=${firstSheet.getSheetId()}`;
    return { success: true, url: reportUrl };

  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em generateSkuReportCustom: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao gerar relatório: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Converte planilha para CSV
 */
function convertSpreadsheetToCSV(ss) {
  const sheets = ss.getSheets();
  let csvContent = '';
  
  sheets.forEach((sheet, index) => {
    if (index > 0) csvContent += '\n\n';
    csvContent += `=== ${sheet.getName()} ===\n`;
    
    const data = sheet.getDataRange().getValues();
    data.forEach(row => {
      csvContent += row.map(cell => {
        const value = cell === null || cell === undefined ? '' : String(cell);
        // Escapar vírgulas e aspas
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      }).join(',') + '\n';
    });
  });
  
  return csvContent;
}

/**
 * ==================================================================
 * FUNÇÕES DE CADASTRO/REMOÇÃO EM MASSA V2.9
 * ==================================================================
 */

/**
 * Cria template na planilha para cadastro ou remoção em massa
 */
function createTemplateSheet(mode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    let sheetName = '';
    let headers = [];
    let exampleRow = [];
    let requiredColumns = [];

    if (mode === 'cadastro') {
      // Template para cadastro
      sheetName = 'Cadastro_em_massa';
      headers = ['product_code', 'product_name', 'categoria_armazenagem', 'grupo', 'subcategoria', 'nm_fabricante', 'curva', 'altura_cm', 'peso_kg_unitario', 'vol_l_unitario', 'quantidade', 'venda_total', 'is_fragil', 'degelo'];
      exampleRow = ['EXEMPLO001', 'Produto Exemplo', 'seco', 'alimento', 'Subcategoria Exemplo', 'Fabricante Exemplo', 'A', 10.5, 0.3, 0.5, 1, 100.00, 'SIM', 'PODE'];
      requiredColumns = ['product_code', 'product_name', 'quantidade', 'vol_l_unitario'];
    } else if (mode === 'remocao') {
      // Template para remoção
      sheetName = 'Remocao_em_massa';
      headers = ['product_code'];
      exampleRow = ['EXEMPLO001'];
      requiredColumns = ['product_code'];
    } else {
      return { success: false, error: 'Modo inválido' };
    }

    // Verificar se a aba já existe
    let sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      sheet.clear();
    } else {
      sheet = ss.insertSheet(sheetName);
    }

    // Escrever cabeçalhos
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]).setFontWeight('bold');
    
    // Destacar colunas obrigatórias
    headers.forEach((header, index) => {
      if (requiredColumns.includes(header)) {
        const cell = sheet.getRange(1, index + 1);
        cell.setBackground('#d32f2f'); // Vermelho para obrigatórias
        cell.setFontColor('#ffffff');
        cell.setFontWeight('bold');
      } else {
        const cell = sheet.getRange(1, index + 1);
        cell.setBackground('#4285f4'); // Azul para opcionais
        cell.setFontColor('#ffffff');
        cell.setFontWeight('bold');
      }
    });
    
    // Escrever linha de exemplo
    sheet.getRange(2, 1, 1, exampleRow.length).setValues([exampleRow]);
    
    // Auto-ajustar colunas
    headers.forEach((h, i) => sheet.autoResizeColumn(i + 1));
    
    const url = ss.getUrl() + `#gid=${sheet.getSheetId()}`;
    
    return {
      success: true,
      url: url,
      sheetName: sheetName,
      requiredColumns: requiredColumns
    };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em createTemplateSheet: ${e.message}`);
    return { success: false, error: `Erro ao criar template: ${e.message}` };
  }
}

/**
 * Processa operação em massa diretamente da planilha
 */
function processBulkOperationFromSheet(mode) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // 30 segundos para operações em massa

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = mode === 'cadastro' ? 'Cadastro_em_massa' : 'Remocao_em_massa';
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { success: false, error: `Aba "${sheetName}" não encontrada na planilha. Crie a aba primeiro usando o botão "Criar Template na Planilha".` };
    }
    
    const data = getSheetDataAsObjects(sheet);
    
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: 'Aba vazia ou sem dados' };
    }
    
    // Filtrar linha de exemplo se existir
    const filteredData = data.filter(row => {
      const code = String(row.product_code || '').trim();
      return code && code.toUpperCase() !== 'EXEMPLO001' && code !== '';
    });
    
    if (filteredData.length === 0) {
      return { success: false, error: 'Nenhuma linha de dados válida encontrada (apenas exemplo ou vazio)' };
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    if (mode === 'cadastro') {
      // Processar cadastros
      filteredData.forEach((row, index) => {
        try {
          if (!row.product_code || !row.product_name) {
            errorCount++;
            errors.push(`Linha ${index + 2}: Código e nome do produto são obrigatórios`);
            return;
          }

          const product = {
            product_code: String(row.product_code).trim(),
            product_name: String(row.product_name).trim(),
            categoria_armazenagem: row.categoria_armazenagem || '',
            grupo: row.grupo || '',
            subcategoria: row.subcategoria || '',
            nm_fabricante: row.nm_fabricante || '',
            curva: row.curva || '',
            altura_cm: row.altura_cm ? parseFloat(String(row.altura_cm).replace(',', '.')) : null,
            peso_kg_unitario: row.peso_kg_unitario ? parseFloat(String(row.peso_kg_unitario).replace(',', '.')) : null,
            vol_l_unitario: row.vol_l_unitario ? parseFloat(String(row.vol_l_unitario).replace(',', '.')) : null,
            quantidade: row.quantidade ? parseInt(row.quantidade) : null,
            venda_total: row.venda_total ? parseFloat(String(row.venda_total).replace(',', '.')) : null,
            is_fragil: row.is_fragil || 'NAO',
            degelo: row.degelo || 'PODE'
          };

          const result = addNewProduct(product);
          if (result && result.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`Linha ${index + 2}: ${result.error || 'Erro desconhecido'}`);
          }
        } catch (e) {
          errorCount++;
          errors.push(`Linha ${index + 2}: ${e.message}`);
        }
      });
    } else if (mode === 'remocao') {
      // Processar remoções
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const baseSheet = ss.getSheetByName(NOME_ABA_BASE_PRODUTOS);
      const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);

      if (!baseSheet) {
        return { success: false, error: 'Aba Base_Produtos não encontrada' };
      }

      const baseData = getSheetDataAsObjects(baseSheet);
      const headers = baseSheet.getRange(1, 1, 1, baseSheet.getLastColumn()).getValues()[0];

      filteredData.forEach((row, index) => {
        try {
          const productCode = String(row.product_code || '').trim();
          if (!productCode) {
            errorCount++;
            errors.push(`Linha ${index + 2}: Código do produto não informado`);
            return;
          }

          // Encontrar linha do produto
          const productRowIndex = baseData.findIndex(p => String(p.product_code || '').trim() === productCode);
          if (productRowIndex === -1) {
            errorCount++;
            errors.push(`Linha ${index + 2}: Produto ${productCode} não encontrado`);
            return;
          }

          // Remover produto da Base_Produtos
          const rowToDelete = productRowIndex + 2; // +1 para header, +1 para índice base 1
          baseSheet.deleteRow(rowToDelete);

          // Remover do Plano_Enderecamento_Final se existir
          if (planoSheet) {
            const planoData = getSheetDataAsObjects(planoSheet);
            const planoHeaders = planoSheet.getRange(1, 1, 1, planoSheet.getLastColumn()).getValues()[0];
            const productCodeIndex = planoHeaders.findIndex(h => String(h).trim().toLowerCase() === 'product_code');
            
            if (productCodeIndex !== -1) {
              planoData.forEach((row, idx) => {
                if (String(row.product_code || '').trim() === productCode) {
                  planoSheet.getRange(idx + 2, productCodeIndex + 1).setValue('Vazio');
                }
              });
            }
          }

          successCount++;
        } catch (e) {
          errorCount++;
          errors.push(`Linha ${index + 2}: ${e.message}`);
        }
      });

      // Limpar cache
      SCRIPT_CACHE.remove('base_produtos_data');
      SCRIPT_CACHE.remove('plano_final_data');
    }

    return {
      success: true,
      successCount: successCount,
      errorCount: errorCount,
      errors: errors
    };

  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em processBulkOperationFromSheet: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao processar: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Remove (limpa) todos os produtos no Plano_Enderecamento_Final por filtro (grupo ou categoria de armazenagem)
 * Filtros aceitos: quimicos, perfumaria, tudo_armz, prateleira, geladeira, freezer
 */
function _collectProductCodesByFilter(filterKey) {
  const normalizedFilter = String(filterKey || '').trim().toLowerCase();
  const validFilters = new Set(['quimicos', 'perfumaria', 'tudo_armz', 'prateleira', 'geladeira', 'freezer']);
  if (!validFilters.has(normalizedFilter)) {
    return { success: false, error: 'Filtro inválido para remoção total.' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const baseSheet = ss.getSheetByName(NOME_ABA_BASE_PRODUTOS);

    if (!baseSheet) {
      return { success: false, error: 'Aba Base_Produtos não encontrada' };
    }

    const baseValues = baseSheet.getDataRange().getValues();
    if (!Array.isArray(baseValues) || baseValues.length < 2) {
      return { success: true, productCodes: new Set() };
    }

    const normalizeHeader = (value) => {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    };
    const normalizeValue = (value) => {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim();
    };

    const headers = baseValues[0].map(h => String(h).trim());
    const normalizedHeaders = headers.map(normalizeHeader);

    const findHeaderIndex = (candidates) => {
      for (const key of candidates) {
        const idx = normalizedHeaders.indexOf(normalizeHeader(key));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const productCodeIdx = findHeaderIndex(['product_code', 'codigo_sku', 'codigo', 'cod_produto', 'codigo_produto', 'sku']);
    const grupoIdx = findHeaderIndex(['grupo', 'grupo_alocado', 'grupo_produto']);
    const categoriaIdx = findHeaderIndex(['categoria_armazenagem', 'categoria_armz', 'cat_armz', 'categoria']);

    if (productCodeIdx === -1) {
      return { success: false, error: 'Coluna product_code não encontrada na Base_Produtos.' };
    }
    if (['quimicos', 'perfumaria'].includes(normalizedFilter) && grupoIdx === -1) {
      return { success: false, error: 'Coluna grupo não encontrada na Base_Produtos.' };
    }
    if (['tudo_armz', 'prateleira', 'geladeira', 'freezer'].includes(normalizedFilter) && categoriaIdx === -1) {
      return { success: false, error: 'Coluna categoria_armazenagem não encontrada na Base_Produtos.' };
    }

    const productCodesToRemove = new Set();

    for (let i = 1; i < baseValues.length; i++) {
      const row = baseValues[i] || [];
      const productCodeRaw = row[productCodeIdx];
      const productCode = String(productCodeRaw || '').trim();
      if (!productCode || productCode === 'Vazio') continue;

      let match = false;
      const categoria = categoriaIdx !== -1 ? normalizeValue(row[categoriaIdx]) : '';
      if (normalizedFilter === 'quimicos') {
        const grupo = normalizeValue(row[grupoIdx]);
        match = (grupo === 'quimico' || grupo === 'quimicos');
      } else if (normalizedFilter === 'perfumaria') {
        const grupo = normalizeValue(row[grupoIdx]);
        match = (grupo === 'perfumaria');
      } else if (normalizedFilter === 'tudo_armz') {
        match = (categoria === 'seco' || categoria.includes('prateleira') ||
                 categoria === 'refrigerado' || categoria.includes('geladeira') ||
                 categoria === 'congelado' || categoria.includes('freezer'));
      } else if (normalizedFilter === 'prateleira') {
        match = (categoria === 'seco' || categoria.includes('prateleira'));
      } else if (normalizedFilter === 'geladeira') {
        match = (categoria === 'refrigerado' || categoria.includes('geladeira'));
      } else if (normalizedFilter === 'freezer') {
        match = (categoria === 'congelado' || categoria.includes('freezer'));
      }

      if (match) {
        productCodesToRemove.add(productCode);
      }
    }

    return {
      success: true,
      productCodes: productCodesToRemove,
    };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em _collectProductCodesByFilter: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao processar: ${e.message}` };
  }
}

/**
 * Prévia de quantos SKUs/escaninhos serão limpos
 */
function previewRemoveAllProductsByFilter(filterKey) {
  const result = _collectProductCodesByFilter(filterKey);
  if (!result || !result.success) {
    return result || { success: false, error: 'Erro ao calcular prévia.' };
  }

  const productCodesToRemove = result.productCodes || new Set();
  if (productCodesToRemove.size === 0) {
    return { success: true, sku_count: 0, plano_count: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
  if (!planoSheet) {
    return { success: false, error: 'Aba Plano_Enderecamento_Final não encontrada' };
  }

  const planoValues = planoSheet.getDataRange().getValues();
  if (!planoValues || planoValues.length < 2) {
    return { success: true, sku_count: 0, plano_count: 0 };
  }

  const planoHeaders = planoValues[0].map(h => String(h).trim());
  const normalized = planoHeaders.map(h => String(h || '').trim().toLowerCase());
  const productCodeIdx = normalized.indexOf('product_code');
  if (productCodeIdx === -1) {
    return { success: false, error: 'Coluna product_code não encontrada no Plano_Enderecamento_Final.' };
  }

  let planoCount = 0;
  const skuSet = new Set();
  for (let i = 1; i < planoValues.length; i++) {
    const row = planoValues[i] || [];
    const code = String(row[productCodeIdx] || '').trim();
    if (code && productCodesToRemove.has(code)) {
      planoCount++;
      skuSet.add(code);
    }
  }

  return {
    success: true,
    sku_count: skuSet.size,
    plano_count: planoCount,
  };
}

/**
 * Remove (limpa) todos os produtos no Plano_Enderecamento_Final por filtro (grupo ou categoria de armazenagem)
 * Filtros aceitos: quimicos, perfumaria, tudo_armz, prateleira, geladeira, freezer
 */
function removeAllProductsByFilter(filterKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const result = _collectProductCodesByFilter(filterKey);
    if (!result || !result.success) {
      return result || { success: false, error: 'Erro ao processar remoção.' };
    }

    const productCodesToRemove = result.productCodes || new Set();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);

    if (!planoSheet) {
      return { success: false, error: 'Aba Plano_Enderecamento_Final não encontrada' };
    }

    if (productCodesToRemove.size === 0) {
      return { success: true, plano_updated: 0 };
    }

    const planoValues = planoSheet.getDataRange().getValues();
    if (!planoValues || planoValues.length < 2) {
      return { success: true, plano_updated: 0 };
    }

    const headers = getHeaders(planoSheet);
    const normalized = headers.map(h => String(h || '').trim().toLowerCase());
    const productCodeIdx = normalized.indexOf('product_code');
    if (productCodeIdx === -1) {
      return { success: false, error: 'Coluna product_code não encontrada no Plano_Enderecamento_Final.' };
    }

    let planoUpdated = 0;
    for (let i = 1; i < planoValues.length; i++) {
      const originalRow = planoValues[i];
      const code = String(originalRow[productCodeIdx] || '').trim();
      if (code && productCodesToRemove.has(code)) {
        const rowNum = i + 1;
        const newRowData = headers.map((header, index) =>
          buildNewRowValue(header, index, null, originalRow, headers)
        );
        planoSheet.getRange(rowNum, 1, 1, headers.length).setValues([newRowData]);
        planoUpdated++;
      }
    }

    SpreadsheetApp.flush();

    // Base_Produtos não é alterada; limpa cache apenas do plano, se existir
    SCRIPT_CACHE.remove('plano_final_data');
    SCRIPT_CACHE.remove('location_id_map_v2.7');
    SCRIPT_CACHE.remove('plano_headers_v2.7');
    SCRIPT_CACHE.remove('dic_cat_map_v2.3.18');

    return {
      success: true,
      plano_updated: planoUpdated,
    };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em removeAllProductsByFilter: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao remover: ${e.message}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Versões do Plano_Enderecamento_Final (snapshot)
 */
function _sanitizeVersionName(name) {
  return String(name || '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'sem_nome';
}

function _buildVersionSheetName(baseName, existingNames) {
  const tz = "America/Sao_Paulo";
  const timestamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss");
  const safe = _sanitizeVersionName(baseName);
  let sheetName = `${VERSAO_PREFIX}${timestamp}__${safe}`.substring(0, 100);
  if (!existingNames.has(sheetName)) return sheetName;
  let counter = 1;
  while (true) {
    const suffix = `_${counter}`;
    const trimmed = sheetName.substring(0, Math.max(1, 100 - suffix.length));
    const candidate = `${trimmed}${suffix}`;
    if (!existingNames.has(candidate)) return candidate;
    counter++;
  }
}

function savePlanoVersion(versionName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    if (!planoSheet) {
      return { success: false, error: 'Aba Plano_Enderecamento_Final não encontrada' };
    }
    const existing = new Set(ss.getSheets().map(s => s.getName()));
    const sheetName = _buildVersionSheetName(versionName, existing);
    const newSheet = planoSheet.copyTo(ss);
    newSheet.setName(sheetName);
    return { success: true, version_id: sheetName, label: sheetName };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em savePlanoVersion: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao salvar versão: ${e.message}` };
  }
}

function listPlanoVersions() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const versions = ss.getSheets()
      .map(s => s.getName())
      .filter(name => name.startsWith(VERSAO_PREFIX))
      .map(name => {
        const display = name.replace(VERSAO_PREFIX, '').replace('__', ' ');
        return { version_id: name, label: display, sheet_name: name };
      })
      .sort((a, b) => (a.version_id < b.version_id ? 1 : -1));
    return { success: true, versions: versions };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em listPlanoVersions: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao listar versões: ${e.message}` };
  }
}

function restorePlanoVersion(versionId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    const versionSheet = ss.getSheetByName(versionId);
    if (!planoSheet) {
      return { success: false, error: 'Aba Plano_Enderecamento_Final não encontrada' };
    }
    if (!versionSheet) {
      return { success: false, error: 'Versão não encontrada' };
    }
    const values = versionSheet.getDataRange().getValues();
    planoSheet.clearContents();
    if (values && values.length > 0) {
      planoSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
    SpreadsheetApp.flush();
    return { success: true, rows: values.length, cols: values[0] ? values[0].length : 0 };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em restorePlanoVersion: ${e.message} \n ${e.stack}`);
    return { success: false, error: `Erro ao restaurar versão: ${e.message}` };
  }
}

/**
 * ==================================================================
 * FIM: FUNÇÃO DE RELATÓRIO V2.8
 * ==================================================================
 */


/**
 * FUNÇÕES UTILITÁRIAS (Sem alterações)
 */
function getSheetDataAsObjects(sheet) {
    if (!sheet) { Logger.log("Aviso: getSheetDataAsObjects sheet nulo."); return []; } const data = sheet.getDataRange().getValues(); const headersRaw = data.shift(); if (!headersRaw) return []; const validHeaders = []; const validIndices = []; headersRaw.forEach((h, index) => { const trimmedHeader = String(h || '').trim(); if (trimmedHeader) { validHeaders.push(trimmedHeader); validIndices.push(index); } }); if (validHeaders.length === 0) return []; return data.map((row) => { const obj = {}; validHeaders.forEach((header, i) => { const originalIndex = validIndices[i]; obj[header] = (originalIndex < row.length) ? row[originalIndex] : null; }); return obj; });
}
function escapeHtml(unsafe) { if (unsafe === null || unsafe === undefined) return ''; return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

/**
 * Busca produto por código de barras
 */
function getProductByBarcode(barcode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOME_ABA_BARCODE);
    
    if (!sheet) {
      return { success: false, error: 'Aba de códigos de barras não encontrada' };
    }
    
    const data = getSheetDataAsObjects(sheet);
    // Buscar na coluna "barcode" (não "cod_produto")
    const product = data.find(row => {
      const barcodeValue = String(row.barcode || row.cod_produto || '').trim();
      return barcodeValue === String(barcode).trim();
    });
    
    if (product) {
      return {
        success: true,
        product: {
          cod_produto: product.cod_produto || '',
          nome: product.nome || '',
          categoria: product.categoria || ''
        }
      };
    } else {
      return { success: false, error: 'Produto não encontrado com este código de barras' };
    }
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em getProductByBarcode: ${e.message}`);
    return { success: false, error: `Erro ao buscar produto: ${e.message}` };
  }
}

/**
 * Gera aba KDABRA com dados de endereçamento
 */
function generateKdabraSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = 'KDABTA reenderecar';
    
    // Verificar se a aba já existe
    let sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      sheet.clear();
    } else {
      sheet = ss.insertSheet(sheetName);
    }
    
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    if (!planoSheet) {
      return { success: false, error: 'Aba Plano_Enderecamento_Final não encontrada' };
    }
    
    const planoData = getSheetDataAsObjects(planoSheet);
    
    // Headers
    const headers = ['cod_produto', 'galpao', 'rua', 'estante', 'escaninho'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Formatar cabeçalho
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');

    const estanteColIndex = headers.indexOf('estante') + 1;
    
    // Processar dados
    const rows = [];
    planoData.forEach(row => {
      const productCode = String(row.product_code || '').trim();
      if (!productCode || productCode === 'Vazio') return;
      
      const locationId = String(row.location_id || '').trim();
      if (!locationId) return;
      
      // Parse location_id: formato "LJ100001-R1-001-4A"
      // galpao: LJ100001, rua: R1, estante: 001, escaninho: 4A
      const parts = locationId.split('-');
      if (parts.length >= 4) {
        const galpao = parts[0];
        const rua = parts[1];
        const estanteRaw = parts[2];
        const escaninho = parts.slice(3).join('-'); // Pega tudo depois do terceiro hífen

        const estanteNum = parseInt(estanteRaw, 10);
        const estante = !isNaN(estanteNum) ? String(estanteNum).padStart(3, '0') : String(estanteRaw || '').padStart(3, '0');

        rows.push([productCode, galpao, rua, estante, escaninho]);
      }
    });
    
    // Escrever dados
    if (rows.length > 0) {
      // Formatar coluna estante como texto ANTES de escrever para evitar conversão
      if (estanteColIndex > 0) {
        sheet.getRange(1, estanteColIndex, rows.length + 1, 1).setNumberFormat('@');
      }
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    
    // Auto-ajustar colunas
    headers.forEach((h, i) => sheet.autoResizeColumn(i + 1));
    
    const url = ss.getUrl() + `#gid=${sheet.getSheetId()}`;
    
    return {
      success: true,
      url: url,
      sheetName: sheetName
    };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em generateKdabraSheet: ${e.message}`);
    return { success: false, error: `Erro ao gerar aba KDABTA reenderecar: ${e.message}` };
  }
}

/**
 * Gera aba KDABRA enderecar com dados de endereçamento e ordem
 */
function generateKdabraEnderecarSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = 'kdabra enderecar';
    
    // Verificar se a aba já existe
    let sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      sheet.clear();
    } else {
      sheet = ss.insertSheet(sheetName);
    }
    
    const planoSheet = ss.getSheetByName(NOME_ABA_PLANO_FINAL);
    if (!planoSheet) {
      return { success: false, error: 'Aba Plano_Enderecamento_Final não encontrada' };
    }
    
    const planoData = getSheetDataAsObjects(planoSheet);
    
    // Headers
    const headers = ['galpao', 'rua', 'estante', 'escaninho', 'ordem'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Formatar cabeçalho
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    
    // Processar dados e criar mapa de location_id para ordem
    // IMPORTANTE: Calcular ordem baseado em TODOS os escaninhos (ocupados e vazios)
    // mas gerar linhas apenas para os OCUPADOS
    const locationMap = new Map();
    
    // Primeiro, coletar TODOS os location_ids (ocupados e vazios)
    planoData.forEach(row => {
      const locationId = String(row.location_id || '').trim();
      if (!locationId) return;
      
      // Parse location_id: formato "LJ120001-R1-002-4A"
      const parts = locationId.split('-');
      if (parts.length >= 4) {
        const galpao = parts[0];
        const rua = parts[1];
        const estante = parts[2];
        const escaninho = parts.slice(3).join('-'); // Pega tudo depois do terceiro hífen
        
        // Extrair nível e posição do escaninho (ex: "4A" -> nivel: 4, posicao: "A")
        const nivelMatch = escaninho.match(/^(\d+)/);
        const posicaoMatch = escaninho.match(/([A-Z]+)$/);
        const nivel = nivelMatch ? nivelMatch[1] : '0';
        const posicao = posicaoMatch ? posicaoMatch[1] : '';
        
        // Converter estante para número (pode vir como "002", "2", etc.)
        const estanteNum = parseInt(estante) || 0;
        
        const locationData = {
          locationId: locationId,
          galpao: galpao,
          rua: rua,
          estante: estante,
          escaninho: escaninho,
          ruaNum: parseInt(rua.replace('R', '').replace('r', '')) || 0,
          estanteNum: estanteNum,
          nivel: nivel,
          posicao: posicao
        };

        if (!locationMap.has(locationId)) {
          locationMap.set(locationId, locationData);
        }
      }
    });

    const allLocations = Array.from(locationMap.values());
    
    // Ordenar TODOS os escaninhos para calcular ordem
    // Ordem: rua (crescente) -> estante (crescente) -> nível (decrescente, mais alto primeiro) -> posição (A, B, C...)
    allLocations.sort((locA, locB) => {
      // 1. Ordenar por rua (crescente)
      if (locA.ruaNum !== locB.ruaNum) {
        return locA.ruaNum - locB.ruaNum;
      }
      
      // 2. Ordenar por estante (crescente)
      if (locA.estanteNum !== locB.estanteNum) {
        return locA.estanteNum - locB.estanteNum;
      }
      
      // 3. Ordenar por nível (decrescente - mais alto primeiro: 4, 3, 2, 1)
      const nivelA = parseInt(locA.nivel) || 0;
      const nivelB = parseInt(locB.nivel) || 0;
      if (nivelA !== nivelB) {
        return nivelB - nivelA; // Decrescente
      }
      
      // 4. Ordenar por posição (A, B, C, D, E...)
      return locA.posicao.localeCompare(locB.posicao);
    });
    
    // Atribuir ordem sequencial começando do 1 para TODOS os escaninhos
    allLocations.forEach((locationData, index) => {
      locationData.ordem = index + 1;
    });
    
    // Gerar linhas com ordem (TODOS os escaninhos, ocupados e vazios)
    const rows = [];
    allLocations.forEach(locationData => {
      // Formatar estante para sempre ter 3 dígitos (001, 002, 003, etc.)
      // Usar estanteNum (número) e formatar com zeros à esquerda
      const estanteNum = locationData.estanteNum || 0;
      // Garantir que seja string com 3 dígitos
      const estanteFormatted = String(estanteNum).padStart(3, '0');
      
      // Incluir TODOS os escaninhos na aba, ocupados e vazios
      rows.push([
        locationData.galpao,
        locationData.rua,
        estanteFormatted, // Já formatado com 3 dígitos como string
        locationData.escaninho,
        locationData.ordem
      ]);
    });
    
    // Formatar coluna estante como texto ANTES de escrever para preservar zeros à esquerda
    const estanteColIndex = headers.indexOf('estante') + 1; // +1 porque getRange é 1-indexed
    if (estanteColIndex > 0 && rows.length > 0) {
      // Formatar toda a coluna estante (incluindo header) como texto ANTES de escrever
      sheet.getRange(1, estanteColIndex, rows.length + 1, 1).setNumberFormat('@'); // '@' = formato texto
    }
    
    // Escrever dados
    if (rows.length > 0) {
      const range = sheet.getRange(2, 1, rows.length, headers.length);
      range.setValues(rows);
      
      // Garantir novamente que a coluna estante está como texto após escrever
      if (estanteColIndex > 0) {
        sheet.getRange(2, estanteColIndex, rows.length, 1).setNumberFormat('@');
      }
    }
    
    // Auto-ajustar colunas
    headers.forEach((h, i) => sheet.autoResizeColumn(i + 1));
    
    const url = ss.getUrl() + `#gid=${sheet.getSheetId()}`;
    
    return {
      success: true,
      url: url,
      sheetName: sheetName
    };
  } catch (e) {
    if (!IS_TESTING_MODE) Logger.log(`ERRO em generateKdabraEnderecarSheet: ${e.message}`);
    return { success: false, error: `Erro ao gerar aba KDABRA enderecar: ${e.message}` };
  }
}

/**
 * Extrai o texto entre colchetes do nome da planilha
 */
function getSpreadsheetTitle() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const name = ss.getName();
    const match = name.match(/\[([^\]]+)\]/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return 'Dashboard Interativo da Loja'; // Fallback
  } catch (e) {
    return 'Dashboard Interativo da Loja'; // Fallback
  }
}
