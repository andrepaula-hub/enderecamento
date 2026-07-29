(function () {
  'use strict';

  function buildStoresFromWorkflow(workflowPayload) {
    var metabaseSales = workflowPayload && workflowPayload.metabase_sales;
    var card175 = workflowPayload && workflowPayload.card175;
    var availableStores = metabaseSales && metabaseSales.available_stores;
    var storeCodeById = card175 && card175.store_code_by_id || {};
    if (!availableStores || !availableStores.length) return [];
    return availableStores.map(function (s) {
      return { id: s.value, nome: s.label, codigo: storeCodeById[s.value] || '' };
    });
  }

  function postApi(funcName, args) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/' + funcName, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ args: args || [] }));
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error('HTTP ' + xhr.status + ' ao chamar ' + funcName);
    }
    return xhr.responseText ? JSON.parse(xhr.responseText) : {};
  }

  async function postApiAsync(funcName, args) {
    var response = await fetch('/api/' + funcName, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: args || [] }),
    });
    var text = await response.text();
    var payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (error) { payload = {}; }
    if (!response.ok) {
      throw new Error(payload.error || ('HTTP ' + response.status + ' ao chamar ' + funcName));
    }
    return payload;
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeSearchText(value) {
    return normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function parseBoardEntryCode(entryId) {
    var raw = normalizeText(entryId);
    if (!raw) return '';
    var collectedMatch = raw.match(/^collected::(.+?)::\d+$/);
    if (collectedMatch) return normalizeText(collectedMatch[1]);
    var unallocatedMatch = raw.match(/^unallocated::(.+?)::\d+$/);
    if (unallocatedMatch) return normalizeText(unallocatedMatch[1]);
    return raw;
  }

  var VERTICAL_LANE_LOCKS_STORAGE_KEY = 'enderecamento:vertical_lane_locks:v1';

  function verticalLaneKey(equipId, pos) {
    var normalizedEquip = normalizeText(equipId);
    var normalizedPos = String(pos == null ? '' : pos).trim();
    return normalizedEquip && normalizedPos ? normalizedEquip + '|' + normalizedPos : '';
  }

  function readVerticalLaneLocks() {
    try {
      var raw = window.localStorage.getItem(VERTICAL_LANE_LOCKS_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeVerticalLaneLocks(locks) {
    try {
      window.localStorage.setItem(VERTICAL_LANE_LOCKS_STORAGE_KEY, JSON.stringify(locks || []));
    } catch (error) {}
  }

  function isVerticalLaneLocked(equipId, pos, locks) {
    var key = verticalLaneKey(equipId, pos);
    if (!key) return false;
    var list = Array.isArray(locks) ? locks : readVerticalLaneLocks();
    return list.indexOf(key) >= 0;
  }

  function normalizeGroup(value) {
    var text = normalizeText(value).toLowerCase();
    if (text === 'flv' || text === 'flvs') return 'FLV';
    if (text === 'alimento' || text === 'alimentos') return 'Alimento';
    if (text === 'bebida' || text === 'bebidas') return 'Bebidas';
    if (text === 'perfumaria') return 'Perfumaria';
    if (text === 'quimico' || text === 'quimicos' || text === 'químico' || text === 'químicos') return 'Químico';
    return 'Neutro';
  }

  function normalizeCurve(value, fabricante) {
    var curva = normalizeText(value).toUpperCase();
    var marca = normalizeText(fabricante).toUpperCase();
    if (/^[A-Z]$/.test(curva)) return curva;
    if (/^[0-9]+$/.test(curva) && /^[A-Z]$/.test(marca)) return marca;
    return curva || 'E';
  }

  function normalizeDegelo(value) {
    var text = normalizeText(value).toUpperCase();
    if (text === 'NAO') return 'NÃO';
    if (text === 'PODE') return 'PODE';
    return text || 'N/A';
  }

  function toNumber(value, fallback) {
    var num = parseFloat(String(value == null ? '' : value).replace(',', '.'));
    return Number.isFinite(num) ? num : (fallback == null ? 0 : fallback);
  }

  function toInt(value, fallback) {
    var num = parseInt(String(value == null ? '' : value), 10);
    return Number.isFinite(num) ? num : (fallback == null ? 0 : fallback);
  }

  function requiredBins(row) {
    var value = toNumber(row && row.escaninhos_necessarios, 1);
    return Math.max(1, Math.ceil(value || 1));
  }

  function normalizeEquipType(value) {
    var text = normalizeText(value).toLowerCase().replace(/\s+/g, '_');
    if (text.indexOf('pamplona') >= 0) return 'prateleira_pamplona';
    if (text.indexOf('gerador') >= 0 || text.indexOf('degelo') >= 0) return 'geladeira_gerador';
    if (text.indexOf('geladeira_alta') >= 0 || text.indexOf('geladeira-alta') >= 0) return 'geladeira_alta';
    if (text.indexOf('geladeira') >= 0) return 'geladeira';
    if (text.indexOf('freezer') >= 0) return 'freezer';
    if (text.indexOf('quim') >= 0) return 'quimico';
    if (text.indexOf('prateleira') >= 0) return text;
    return 'prateleira';
  }

  function parseEquipId(actualId, ruaNum, equipNum) {
    var normalizedActualId = normalizeText(actualId);
    if (normalizedActualId) return normalizedActualId;
    return 'R' + ruaNum + '-E' + equipNum;
  }

  function buildProducts(baseMap, searchProducts, extraProducts) {
    var codes = [];
    var seenCodes = {};
    var searchByCode = {};
    var extraByCode = {};
    (searchProducts || []).forEach(function (item) {
      searchByCode[normalizeText(item.code)] = item;
    });
    (extraProducts || []).forEach(function (item) {
      var code = normalizeText(item && (item.product_code || item.id));
      if (code && !extraByCode[code]) extraByCode[code] = item;
    });
    Object.keys(baseMap || {}).forEach(function (code) {
      var normalized = normalizeText(code);
      if (!normalized || seenCodes[normalized]) return;
      seenCodes[normalized] = true;
      codes.push(normalized);
    });
    Object.keys(extraByCode).forEach(function (code) {
      var normalized = normalizeText(code);
      if (!normalized || seenCodes[normalized]) return;
      seenCodes[normalized] = true;
      codes.push(normalized);
    });
    Object.keys(searchByCode).forEach(function (code) {
      var normalized = normalizeText(code);
      if (!normalized || seenCodes[normalized]) return;
      seenCodes[normalized] = true;
      codes.push(normalized);
    });

    var products = codes
      .filter(function (code) { return code && code !== 'Vazio'; })
      .map(function (code) {
        var row = baseMap[code] || extraByCode[code] || searchByCode[code] || {};
        return {
          id: code,
          nome: normalizeText(row.product_name || (searchByCode[code] || {}).name || code),
          grupo: normalizeGroup(row.grupo || row.grupo_alocado),
          sub: normalizeText(row.subcategoria || 'Sem subcategoria'),
          subNivel2: normalizeText(row.subcategoria_nivel_2 || row.subcategoria_nivel2 || ''),
          fabricante: normalizeText(row.nm_fabricante || row.fabricante || row.marca || ''),
          curva: normalizeCurve(row.curva, row.nm_fabricante),
          altura: toNumber(row.altura_cm, 0),
          peso: toNumber(row.peso_kg_unitario, 0),
          vol: toNumber(row.vol_L_unitario || row.vol_l_unitario, 0),
          qtd: toNumber(row.quantidade, 0),
          degelo: normalizeDegelo(row.degelo),
          metodo: normalizeText(row.metodo || row.metodo_enderecamento || 'N/A'),
          photoUrl: normalizeText(row.photo_url || row.url_foto || row.foto || ''),
          escsNec: requiredBins(row),
          pequeno: String(row.is_pequeno || '').toUpperCase() === 'SIM' || row.is_pequeno === true,
          fragil: String(row.is_fragil || '').toUpperCase() === 'SIM',
          pesado: String(row.is_pesado || '').toUpperCase() === 'SIM' || row.is_pesado === true,
          alto: String(row.is_alto || '').toUpperCase() === 'SIM' || row.is_alto === true,
          quimico: normalizeGroup(row.grupo) === 'Químico',
          arm: normalizeText(row.categoria_armazenagem || 'N/A'),
          raw: row,
        };
      });

    var map = {};
    products.forEach(function (product) {
      map[product.id] = product;
    });
    return { products: products, productMap: map };
  }

  function parseMap(contentHtml) {
    var parser = new DOMParser();
    var doc = parser.parseFromString('<div id="root">' + (contentHtml || '') + '</div>', 'text/html');
    var streets = [];
    var allocations = {};
    var slotMeta = {};
    var initialPlacements = {};

    function streetSortValue(id) {
      var raw = normalizeText(id).replace(/^R/i, '');
      var n = toInt(raw, 0);
      return n ? { group: 1, n: n, raw: raw } : { group: 0, n: 0, raw: raw };
    }

    Array.prototype.forEach.call(doc.querySelectorAll('.rua[data-rua-num]'), function (streetEl) {
      var ruaRaw = normalizeText(streetEl.getAttribute('data-rua-num')).toUpperCase();
      if (!ruaRaw) return;
      var ruaNum = toInt(ruaRaw, 0) || ruaRaw;
      var streetId = 'R' + ruaRaw;
      var street = {
        id: streetId,
        nome: ruaRaw.match(/^\d+$/) ? 'Rua ' + ruaRaw : streetId,
        equipment: [],
      };

      Array.prototype.forEach.call(streetEl.querySelectorAll('.equipamento'), function (equipEl) {
        var bins = Array.prototype.slice.call(equipEl.querySelectorAll('.escaninho[data-rua-num][data-equip-num][data-level-num]'));
        if (!bins.length) return;
        var first = bins[0];
        var equipNum = toInt(first.getAttribute('data-equip-num'), 0);
        if (!equipNum) return;
        var equipId = parseEquipId(equipEl.id, ruaNum, equipNum);
        var levels = {};
        var maxPos = 0;
        bins.forEach(function (binEl) {
          var level = toInt(binEl.getAttribute('data-level-num'), 0);
          var title = normalizeText(binEl.getAttribute('title'));
          var match = title.match(/([0-9]+)([A-Z])$/i);
          var pos = match ? match[2].toUpperCase().charCodeAt(0) - 64 : 0;
          if (level > 0) levels[level] = true;
          if (pos > maxPos) maxPos = pos;

          var escId = equipId + '-' + level + '-' + pos;
          var slot1 = normalizeText(binEl.getAttribute('data-slot1-code'));
          var slot2 = normalizeText(binEl.getAttribute('data-slot2-code'));
          allocations[escId] = {
            p1: slot1 && slot1 !== 'Vazio' ? slot1 : null,
            p2: slot2 && slot2 !== 'Vazio' ? slot2 : null,
          };
          if (!allocations[escId].p1 && !allocations[escId].p2) delete allocations[escId];

          var locationId = title;
          slotMeta[escId] = {
            escId: escId,
            locationId: locationId,
            backendBinId: 'bin-' + locationId,
            equipId: equipId,
            ruaNum: ruaNum,
            equipNum: equipNum,
            level: level,
            pos: pos,
            slot1InstanceId: normalizeText(binEl.getAttribute('data-slot1-instance-id')),
            slot2InstanceId: normalizeText(binEl.getAttribute('data-slot2-instance-id')),
            cardAddressOriginal: normalizeText(binEl.getAttribute('data-card-address-original')),
          };

          [slot1, slot2].forEach(function (code) {
            if (!code || code === 'Vazio') return;
            if (!initialPlacements[code]) initialPlacements[code] = [];
            initialPlacements[code].push(escId);
          });
        });

        street.equipment.push({
          id: equipId,
          tipo: normalizeEquipType(first.getAttribute('data-equip-type')),
          niveis: Object.keys(levels).length,
          escsPerNivel: maxPos,
          cap: toNumber(first.getAttribute('data-capacidade-l'), 0),
          card175Only: equipEl.classList.contains('equipamento-card175-only'),
        });
      });

      streets.push(street);
    });

    streets.sort(function (a, b) {
      var aa = streetSortValue(a.id);
      var bb = streetSortValue(b.id);
      if (aa.group !== bb.group) return aa.group - bb.group;
      if (aa.n !== bb.n) return aa.n - bb.n;
      return aa.raw.localeCompare(bb.raw);
    });
    streets.forEach(function (street) {
      street.equipment.sort(function (a, b) {
        return toInt(String(a.id).split('-').pop(), 0) - toInt(String(b.id).split('-').pop(), 0);
      });
    });

    return {
      streets: streets,
      allocations: allocations,
      slotMeta: slotMeta,
      initialPlacements: initialPlacements,
    };
  }

  function buildBootstrap() {
    var workflow = {};
    var rawData = {};
    try {
      workflow = postApi('getWorkflowSheets', []);
    } catch (error) {
      workflow = { success: false, error: String(error) };
    }

    try {
      rawData = postApi('getInitialData', []);
    } catch (error) {
      rawData = { error: String(error) };
    }

    var baseMap = {};
    var searchProducts = [];
    var unallocatedMap = {};
    try { baseMap = JSON.parse(rawData.all_products_data_map_json || '{}'); } catch (error) {}
    try { searchProducts = JSON.parse(rawData.all_products_json || '[]'); } catch (error) {}
    try { unallocatedMap = JSON.parse(rawData.unallocated_products_json || '{}'); } catch (error) {}

    var productsBundle = buildProducts(baseMap, searchProducts, Object.values(unallocatedMap || {}));
    var parsedMap = parseMap(rawData.content_html || '');
    var workflowPayload = workflow && workflow.success ? workflow : {};
    var activeSheet = workflowPayload.target || (workflowPayload.sheet || null);
    var metabaseSales = workflowPayload.metabase_sales || {};
    var unallocatedIds = Object.keys(unallocatedMap || {}).filter(function (entryId) {
      var item = unallocatedMap[entryId] || {};
      var code = normalizeText(item.product_code || parseBoardEntryCode(entryId));
      return !!productsBundle.productMap[code];
    });

    return {
      STORES: buildStoresFromWorkflow(workflowPayload),
      METABASE_SALES: metabaseSales,
      PRODUCTS: productsBundle.products,
      PRODUCT_MAP: productsBundle.productMap,
      STREETS_STRUCTURE: parsedMap.streets,
      INITIAL_ALLOCATIONS: parsedMap.allocations,
      INITIAL_UNALLOCATED: unallocatedIds.filter(function (entryId) {
        var item = unallocatedMap[entryId] || {};
        var code = normalizeText(item.product_code || parseBoardEntryCode(entryId));
        return !!productsBundle.productMap[code];
      }),
      RAW_UNALLOCATED_MAP: unallocatedMap,
      RAW_PRODUCT_DATA_MAP: baseMap,
      SLOT_META: parsedMap.slotMeta,
      INITIAL_PLACEMENTS: parsedMap.initialPlacements,
      ACTIVE_SHEET: activeSheet,
      WORKFLOW: workflowPayload,
      RAW_INITIAL_DATA: rawData,
      API_ERROR: rawData && rawData.error ? rawData.error : null,
    };
  }

  var BOOTSTRAP = buildBootstrap();

  window.DSEApi = {
    postApi: postApi,
    postApiAsync: postApiAsync,
    saveVersion: function (name) { return postApi('savePlanoVersion', [name]); },
    saveVersionAsync: function (name) { return postApiAsync('savePlanoVersion', [name]); },
    saveVersionSnapshotAsync: function (name, locations, expectedEquipments, user) { return postApiAsync('savePlanoVersionSnapshot', [name, locations || [], expectedEquipments || [], user || 'interface']); },
    listVersions: function () { return postApi('listPlanoVersions', []); },
    listVersionsAsync: function () { return postApiAsync('listPlanoVersions', []); },
    restoreVersion: function (versionId) { return postApi('restorePlanoVersion', [versionId]); },
    restoreVersionAsync: function (versionId) { return postApiAsync('restorePlanoVersion', [versionId]); },
    getPlanoFingerprintAsync: function () { return postApiAsync('getPlanoFingerprint', []); },
    deleteVersion: function (versionId) { return postApi('deletePlanoVersion', [versionId]); },
    deleteVersionAsync: function (versionId) { return postApiAsync('deletePlanoVersion', [versionId]); },
    getMapLoadStatus: function () { return postApi('getMapLoadStatus', []); },
    connectWorkflowSheets: function (target, master, mix) { return postApi('connectWorkflowSheets', [target, master, mix]); },
    getWorkflowSheets: function () { return postApi('getWorkflowSheets', []); },
    runEtl: function (options) { return postApi('runEtlToBaseProducts', options ? [options] : []); },
    sendEtlWarningGroupAsync: function (warningType) { return postApiAsync('sendEtlWarningGroupJob', [warningType]); },
    sendMissingVolumetriaDefaultAsync: function (defaultVolumeCm3) { return postApiAsync('sendMissingVolumetriaDefault', [defaultVolumeCm3]); },
    refreshEtlWarningAsync: function (warningType) { return postApiAsync('refreshEtlWarning', [warningType]); },
    generateSlots: function () { return postApi('generateSlotsFromCadastro', [true]); },
    buildSalesTarget: function (payload) { return postApi('buildMetabaseSalesTarget', [payload]); },
    buildSalesTargetAsync: function (payload) { return postApiAsync('buildMetabaseSalesTargetJob', [payload]); },
    exportSalesXlsx: function (payload) { return postApi('exportMetabaseSalesXlsx', [payload]); },
    importCard175Metabase: function (payload) { return postApi('importCard175Metabase', [payload]); },
    importCard175MetabaseJobAsync: function (payload) { return postApiAsync('importCard175MetabaseJob', [payload]); },
    saveBatchMoves: function (moves, options) { return postApi('saveBatchMoves', [moves, options || {}]); },
    saveBatchMovesAsync: function (moves, options) { return postApiAsync('saveBatchMoves', [moves, options || {}]); },
    createNewEquipmentAsync: function (ruaNum, equipNum, equipType, user) { return postApiAsync('createNewEquipment', [ruaNum, equipNum, equipType, user || 'interface']); },
    deleteEquipmentAndProductsAsync: function (equipId, user) { return postApiAsync('deleteEquipmentAndProducts', [equipId, user || 'interface']); },
    renameEquipmentAsync: function (oldEquipId, newEquipId, user) { return postApiAsync('renameEquipment', [oldEquipId, newEquipId, user || 'interface']); },
    changeEquipmentTypeAsync: function (equipId, newType, recolherProdutos) { return postApiAsync('changeEquipmentType', [equipId, newType, !!recolherProdutos]); },
    generateLayoutAtual: function () { return postApi('generateLayoutAtual', []); },
    generateLayoutAtualAsync: function () { return postApiAsync('generateLayoutAtual', []); },
    generateEquipmentSummaryAsync: function () { return postApiAsync('generateEquipmentSummary', []); },
    generateKdabraSheet: function () { return postApi('generateKdabraSheet', []); },
    generateKdabraSheetAsync: function () { return postApiAsync('generateKdabraSheet', []); },
    generateKdabraEnderecarSheet: function () { return postApi('generateKdabraEnderecarSheet', []); },
    generateKdabraEnderecarSheetAsync: function () { return postApiAsync('generateKdabraEnderecarSheet', []); },
    download: function () { window.location.href = '/api/download'; },
    refreshBootstrap: function () {
      window.location.reload();
    },
  };

  window.DSEBootstrap = BOOTSTRAP;
  window.DSEData = {
    STORES: BOOTSTRAP.STORES,
    METABASE_SALES: BOOTSTRAP.METABASE_SALES,
    PRODUCTS: BOOTSTRAP.PRODUCTS,
    PRODUCT_MAP: BOOTSTRAP.PRODUCT_MAP,
    STREETS_STRUCTURE: BOOTSTRAP.STREETS_STRUCTURE,
    INITIAL_ALLOCATIONS: BOOTSTRAP.INITIAL_ALLOCATIONS,
    INITIAL_UNALLOCATED: BOOTSTRAP.INITIAL_UNALLOCATED,
  };

  window.DSEHelpers = {
    normalizeText: normalizeText,
    normalizeSearchText: normalizeSearchText,
    parseBoardEntryCode: parseBoardEntryCode,
    verticalLaneKey: verticalLaneKey,
    readVerticalLaneLocks: readVerticalLaneLocks,
    writeVerticalLaneLocks: writeVerticalLaneLocks,
    isVerticalLaneLocked: isVerticalLaneLocked,
  };
})();
