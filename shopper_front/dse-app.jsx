// DSE App v3 — SearchBar, swap contents, recolher rua, highlight navigation
const { useState, useEffect, useCallback, useReducer, useMemo, useRef } = React;

const {
  DSEConfigPanel, DSEMapCanvas, DSEPrancheta,
  DSEMetricsPanel, DSEVersionsPanel, DSELegendPanel,
  TweaksPanel, TweakSection, TweakToggle, TweakRadio, TweakSlider,
} = window;

const { STREETS_STRUCTURE, PRODUCTS, PRODUCT_MAP, INITIAL_ALLOCATIONS, INITIAL_UNALLOCATED } = window.DSEData;
const BOOTSTRAP = window.DSEBootstrap || {};
const API = window.DSEApi;
const HELPERS = window.DSEHelpers || {};
const { useTweaks } = window;
const CURVA_COLOR = window.DSE_CURVA_COLOR;
const GROUP_STYLE = window.DSE_GROUP_STYLE;
const normalizeSearchText = HELPERS.normalizeSearchText || ((value) => String(value || '').toLowerCase());
const DSE_SELECTED_STORE_KEY = 'dse.selectedStore.v1';

function resolveBoardEntryProductCode(entryId) {
  const raw = HELPERS.normalizeText ? HELPERS.normalizeText(entryId) : String(entryId || '').trim();
  if (!raw) return '';
  const unallocatedMap = BOOTSTRAP.RAW_UNALLOCATED_MAP || {};
  if (unallocatedMap[raw] && unallocatedMap[raw].product_code) return String(unallocatedMap[raw].product_code).trim();
  if (HELPERS.parseBoardEntryCode) return HELPERS.parseBoardEntryCode(raw);
  return raw;
}

function createCollectedEntryId(code, existingEntries) {
  const normalized = String(code || '').trim();
  const prefix = 'collected::' + normalized + '::';
  let nextIdx = 1;
  (existingEntries || []).forEach((entryId) => {
    if (String(entryId || '').startsWith(prefix)) {
      const suffix = parseInt(String(entryId).slice(prefix.length), 10);
      if (Number.isFinite(suffix) && suffix >= nextIdx) nextIdx = suffix + 1;
    }
  });
  return prefix + nextIdx;
}

function createUnallocatedEntryId(code, existingEntries) {
  const normalized = String(code || '').trim();
  const prefix = 'unallocated::' + normalized + '::';
  let nextIdx = 1;
  (existingEntries || []).forEach((entryId) => {
    if (String(entryId || '').startsWith(prefix)) {
      const suffix = parseInt(String(entryId).slice(prefix.length), 10);
      if (Number.isFinite(suffix) && suffix >= nextIdx) nextIdx = suffix + 1;
    }
  });
  return prefix + nextIdx;
}

function parseEscaninhoId(escaninhoId) {
  const parts = String(escaninhoId || '').split('-');
  const pos = parseInt(parts.pop() || '', 10);
  const level = parseInt(parts.pop() || '', 10);
  const equipId = parts.join('-');
  return {
    escaninhoId: String(escaninhoId || ''),
    equipId,
    level: Number.isFinite(level) ? level : 0,
    pos: Number.isFinite(pos) ? pos : 0,
  };
}

function inferSelectedStoreFromBootstrap() {
  const stores = (window.DSEData && window.DSEData.STORES) || BOOTSTRAP.STORES || [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(DSE_SELECTED_STORE_KEY) || 'null');
    if (saved && saved.id) {
      const matchedSaved = stores.find((store) => String(store.id || '') === String(saved.id || ''));
      return matchedSaved || saved;
    }
  } catch (error) {}
  const title = String(BOOTSTRAP.ACTIVE_SHEET?.title || BOOTSTRAP.WORKFLOW?.target?.title || '').trim();
  const cleanedTitle = title
    .replace(/endere[cç]amento/ig, ' ')
    .replace(/dark|store|loja|teste|confer[eê]ncia|produtos/ig, ' ')
    .replace(/[-_[\]()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedTitle = normalizeSearchText(cleanedTitle).replace(/\s+/g, '');
  const matched = stores.find((store) => {
    const label = normalizeSearchText(store.nome || store.label || '').replace(/\s+/g, '');
    const id = normalizeSearchText(store.id || '').replace(/\s+/g, '');
    return normalizedTitle && (normalizedTitle === label || normalizedTitle === id || normalizedTitle.includes(label) || label.includes(normalizedTitle));
  });
  if (matched) return matched;
  if (cleanedTitle) return { id:cleanedTitle, nome:cleanedTitle, codigo:'' };
  return null;
}

function persistSelectedStore(store) {
  try {
    if (store && store.id) window.localStorage.setItem(DSE_SELECTED_STORE_KEY, JSON.stringify(store));
    else window.localStorage.removeItem(DSE_SELECTED_STORE_KEY);
  } catch (error) {}
}

function requiredBinsForQueueCode(productCode) {
  const product = PRODUCT_MAP[productCode];
  const raw = product && (product.escsNec || product.escaninhos_necessarios);
  const parsed = parseInt(String(raw == null ? '' : raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function capQueueByRemainingBins(queue, allocations) {
  const allocatedCountByCode = {};
  Object.values(allocations || {}).forEach((alloc) => {
    if (!alloc) return;
    ['p1', 'p2'].forEach((field) => {
      const code = resolveBoardEntryProductCode(alloc[field]);
      if (!code) return;
      allocatedCountByCode[code] = (allocatedCountByCode[code] || 0) + 1;
    });
  });
  const used = {};
  return (queue || []).filter((entryId) => {
    const code = resolveBoardEntryProductCode(entryId);
    if (!code) return false;
    const remaining = Math.max(0, requiredBinsForQueueCode(code) - (allocatedCountByCode[code] || 0));
    if ((used[code] || 0) >= remaining) return false;
    used[code] = (used[code] || 0) + 1;
    return true;
  });
}

function collectStreetFillTargets(state, options) {
  const streetId = options && options.streetId;
  const equipmentIds = new Set(options && options.equipmentIds || []);
  const levelMode = options && options.levelMode || 'all';
  const mapStructure = (options && options.mapStructure) || state.mapStructure || [];
  const targets = [];
  (mapStructure || []).forEach((street) => {
    if (streetId && street.id !== streetId) return;
    if (state.streetCollapsed[street.id]) return;
    (street.equipment || []).forEach((eq) => {
      if (equipmentIds.size && !equipmentIds.has(eq.id)) return;
      for (let level = 1; level <= eq.niveis; level += 1) {
        if (levelMode === 'without_top' && level === 1) continue;
        for (let pos = 1; pos <= eq.escsPerNivel; pos += 1) {
          const escaninhoId = `${eq.id}-${level}-${pos}`;
          const alloc = state.allocations[escaninhoId] || {};
          if (!alloc.p1) targets.push(escaninhoId);
        }
      }
    });
  });
  return targets;
}

function fillProductColdClass(productCode) {
  const product = PRODUCT_MAP[productCode];
  if (!product) return 'other';
  const arm = normalizeSearchText(product.arm || product.raw?.categoria_armazenagem || '');
  const degelo = String(product.degelo || '').trim().toUpperCase();
  if (arm.includes('freezer') || arm.includes('congel')) return 'freezer';
  if (arm.includes('geladeira') || arm.includes('refriger')) {
    if (product.alto) return 'geladeira_alta';
    if (degelo === 'NÃO' || degelo === 'NAO') return 'geladeira_degelo';
    return 'geladeira';
  }
  return 'other';
}

function curvePriorityRank(productCode) {
  const product = PRODUCT_MAP[productCode];
  const curve = String(product?.curva || '').trim().toUpperCase().slice(0, 1);
  return ({ A:1, B:2, C:3, D:4, E:5 })[curve] || 9;
}

function prioritizeStreetFillEntries(entries) {
  return (entries || [])
    .map((entryId, index) => ({ entryId, index, code:resolveBoardEntryProductCode(entryId) }))
    .sort((a, b) => {
      const rankDiff = curvePriorityRank(a.code) - curvePriorityRank(b.code);
      return rankDiff || a.index - b.index;
    })
    .map((item) => item.entryId);
}

function isColdEquipmentType(tipo) {
  const text = normalizeSearchText(tipo || '');
  return text.includes('geladeira') || text.includes('freezer') || text.includes('refriger');
}

function equipmentById(mapStructure, equipId) {
  for (const street of mapStructure || []) {
    const found = (street.equipment || []).find((eq) => eq.id === equipId);
    if (found) return found;
  }
  return null;
}

function mapWithEquipmentTypePlan(mapStructure, typePlan) {
  if (!typePlan || !Object.keys(typePlan).length) return mapStructure;
  return (mapStructure || []).map((street) => ({
    ...street,
    equipment:(street.equipment || []).map((eq) => {
      const nextType = typePlan[eq.id];
      if (!nextType || nextType === eq.tipo) return eq;
      const shape = getEquipShapeForType(mapStructure, nextType, eq.id);
      const originalType = getInitialEquipType(eq.id);
      const changed = !!nextType && nextType !== originalType;
      const nextEq = { ...eq, ...shape, tipo:nextType };
      if (changed) nextEq.tipoAnterior = originalType || eq.tipo;
      else delete nextEq.tipoAnterior;
      return nextEq;
    }),
  }));
}

function equipmentCapacityForType(state, mapStructure, streetId, equipmentId, tipo, levelMode) {
  const plannedMap = mapWithEquipmentTypePlan(mapStructure, { [equipmentId]:tipo });
  return collectStreetFillTargets(state, { streetId, equipmentIds:[equipmentId], levelMode, mapStructure:plannedMap }).length;
}

function countEquipmentForSlots(state, mapStructure, streetId, equipmentIds, tipo, slotsNeeded, levelMode) {
  let count = 0;
  let capacity = 0;
  for (const equipmentId of equipmentIds) {
    if (capacity >= slotsNeeded) break;
    capacity += equipmentCapacityForType(state, mapStructure, streetId, equipmentId, tipo, levelMode);
    count += 1;
  }
  return count;
}

function chooseRegularColdEquipment(coldEquipmentIds, rawPlan) {
  return coldEquipmentIds.findIndex((equipmentId) => !rawPlan[equipmentId]);
}

function powerClusterRuns(coldEquipmentIds, powerEquipmentIds) {
  const runs = [];
  let current = [];
  coldEquipmentIds.forEach((equipmentId, index) => {
    if (powerEquipmentIds.has(equipmentId)) {
      current.push(index);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length) runs.push(current);
  return runs;
}

function choosePowerColdEquipment(coldEquipmentIds, rawPlan, powerEquipmentIds) {
  const runs = powerClusterRuns(coldEquipmentIds, powerEquipmentIds);
  for (const run of runs) {
    if (run.length >= 3) continue;
    const right = run[run.length - 1] + 1;
    if (right < coldEquipmentIds.length && !rawPlan[coldEquipmentIds[right]]) return right;
    const left = run[0] - 1;
    if (left >= 0 && !rawPlan[coldEquipmentIds[left]]) return left;
  }

  for (let index = 0; index < coldEquipmentIds.length; index += 1) {
    const equipmentId = coldEquipmentIds[index];
    if (rawPlan[equipmentId]) continue;
    const touchesFullPowerCluster = runs.some((run) => run.length >= 3 && (index === run[0] - 1 || index === run[run.length - 1] + 1));
    if (!touchesFullPowerCluster) return index;
  }

  return coldEquipmentIds.findIndex((equipmentId) => !rawPlan[equipmentId]);
}

function isPowerColdPlannedType(type, equipmentId, powerEquipmentIds) {
  if (type === 'geladeira_alta') return false;
  return type === 'freezer' || (type === 'geladeira' && powerEquipmentIds.has(equipmentId));
}

function scorePowerColdClusters(coldEquipmentIds, plan, powerEquipmentIds) {
  const runs = powerClusterRuns(
    coldEquipmentIds,
    new Set(coldEquipmentIds.filter((equipmentId) => isPowerColdPlannedType(plan[equipmentId], equipmentId, powerEquipmentIds))),
  );
  let score = 0;
  runs.forEach((run) => {
    if (run.length === 1) score += 20;
    else if (run.length === 2) score += 260;
    else if (run.length === 3) score += 1200;
    else score += 1200 - (run.length - 3) * 260;
  });
  return score;
}

function compactPowerColdClusters(coldEquipmentIds, rawPlan, powerEquipmentIds, degeloPreferredEquipmentIds) {
  const plan = { ...rawPlan };
  const powerIds = new Set(powerEquipmentIds || []);
  const degeloIds = new Set(degeloPreferredEquipmentIds || []);
  const swapEquipment = (fromIndex, toIndex) => {
    const fromId = coldEquipmentIds[fromIndex];
    const toId = coldEquipmentIds[toIndex];
    const fromType = plan[fromId];
    plan[fromId] = plan[toId];
    plan[toId] = fromType;

    const fromPower = powerIds.has(fromId);
    const toPower = powerIds.has(toId);
    if (fromPower !== toPower) {
      if (fromPower) {
        powerIds.delete(fromId);
        powerIds.add(toId);
      } else {
        powerIds.delete(toId);
        powerIds.add(fromId);
      }
    }

    const fromDegelo = degeloIds.has(fromId);
    const toDegelo = degeloIds.has(toId);
    if (fromDegelo !== toDegelo) {
      if (fromDegelo) {
        degeloIds.delete(fromId);
        degeloIds.add(toId);
      } else {
        degeloIds.delete(toId);
        degeloIds.add(fromId);
      }
    }
  };
  const currentPowerRuns = () => powerClusterRuns(
    coldEquipmentIds,
    new Set(coldEquipmentIds.filter((equipmentId) => isPowerColdPlannedType(plan[equipmentId], equipmentId, powerIds))),
  );
  let changed = true;
  let guard = 0;
  while (changed && guard < coldEquipmentIds.length * 2) {
    changed = false;
    guard += 1;
    for (let index = 1; index < coldEquipmentIds.length - 1; index += 1) {
      const equipmentId = coldEquipmentIds[index];
      const currentType = plan[equipmentId];
      if (!currentType || isPowerColdPlannedType(currentType, equipmentId, powerIds)) continue;
      const leftId = coldEquipmentIds[index - 1];
      const rightId = coldEquipmentIds[index + 1];
      const leftIsPower = isPowerColdPlannedType(plan[leftId], leftId, powerIds);
      const rightIsPower = isPowerColdPlannedType(plan[rightId], rightId, powerIds);
      if (!leftIsPower || !rightIsPower) continue;

      const swapIndex = leftIsPower ? index - 1 : index + 1;
      const swapId = coldEquipmentIds[swapIndex];
      const swapType = plan[swapId];
      if (!swapType) continue;

      swapEquipment(index, swapIndex);
      changed = true;
      break;
    }
    if (changed) continue;

    const runs = currentPowerRuns();
    for (const run of runs) {
      if (run.length >= 3) continue;
      const right = run[run.length - 1] + 1;
      if (right < coldEquipmentIds.length && !isPowerColdPlannedType(plan[coldEquipmentIds[right]], coldEquipmentIds[right], powerIds)) {
        const donor = coldEquipmentIds.findIndex((equipmentId, donorIndex) => (
          donorIndex > right
          && isPowerColdPlannedType(plan[equipmentId], equipmentId, powerIds)
          && !runs.some((candidateRun) => candidateRun.includes(donorIndex) && candidateRun.length >= 3)
        ));
        if (donor >= 0) {
          swapEquipment(donor, right);
          changed = true;
          break;
        }
      }
      const left = run[0] - 1;
      if (left >= 0 && !isPowerColdPlannedType(plan[coldEquipmentIds[left]], coldEquipmentIds[left], powerIds)) {
        let donor = -1;
        for (let donorIndex = left - 1; donorIndex >= 0; donorIndex -= 1) {
          const donorId = coldEquipmentIds[donorIndex];
          if (
            isPowerColdPlannedType(plan[donorId], donorId, powerIds)
            && !runs.some((candidateRun) => candidateRun.includes(donorIndex) && candidateRun.length >= 3)
          ) {
            donor = donorIndex;
            break;
          }
        }
        if (donor >= 0) {
          swapEquipment(donor, left);
          changed = true;
          break;
        }
      }
    }
  }
  let improved = true;
  let optimizeGuard = 0;
  while (improved && optimizeGuard < coldEquipmentIds.length) {
    improved = false;
    optimizeGuard += 1;
    let best = { score:scorePowerColdClusters(coldEquipmentIds, plan, powerIds), from:-1, to:-1 };
    for (let from = 0; from < coldEquipmentIds.length; from += 1) {
      const fromId = coldEquipmentIds[from];
      const fromIsPower = isPowerColdPlannedType(plan[fromId], fromId, powerIds);
      for (let to = 0; to < coldEquipmentIds.length; to += 1) {
        if (from === to) continue;
        const toId = coldEquipmentIds[to];
        const toIsPower = isPowerColdPlannedType(plan[toId], toId, powerIds);
        if (fromIsPower === toIsPower) continue;
        swapEquipment(from, to);
        const score = scorePowerColdClusters(coldEquipmentIds, plan, powerIds) - Math.abs(from - to);
        swapEquipment(from, to);
        if (score > best.score) best = { score, from, to };
      }
    }
    if (best.from >= 0) {
      swapEquipment(best.from, best.to);
      improved = true;
    }
  }
  return { plan, powerEquipmentIds:powerIds, degeloPreferredEquipmentIds:degeloIds };
}

function buildColdTypePlanFromPriority(state, mapStructure, streetId, coldEquipmentIds, remainingEntries, levelMode) {
  const plan = {};
  const remainingByEquipment = {};
  const degeloPreferred = new Set();
  const powerEquipmentIds = new Set();

  (remainingEntries || []).forEach((entryId) => {
    const code = resolveBoardEntryProductCode(entryId);
    const cls = fillProductColdClass(code);
    if (cls === 'other') return;
    const targetType = cls === 'freezer' ? 'freezer' : cls === 'geladeira_alta' ? 'geladeira_alta' : 'geladeira';
    const isPowerCold = cls === 'freezer' || cls === 'geladeira_degelo';

    let equipmentId = coldEquipmentIds.find((candidateId) => (
      plan[candidateId] === targetType && (remainingByEquipment[candidateId] || 0) > 0
      && (targetType !== 'geladeira' || powerEquipmentIds.has(candidateId) === isPowerCold)
    ));
    if (!equipmentId) {
      const index = isPowerCold
        ? choosePowerColdEquipment(coldEquipmentIds, plan, powerEquipmentIds)
        : chooseRegularColdEquipment(coldEquipmentIds, plan);
      if (index < 0) return;
      equipmentId = coldEquipmentIds[index];
      plan[equipmentId] = targetType;
      remainingByEquipment[equipmentId] = equipmentCapacityForType(state, mapStructure, streetId, equipmentId, targetType, levelMode);
    }
    if ((remainingByEquipment[equipmentId] || 0) <= 0) return;
    remainingByEquipment[equipmentId] -= 1;
    if (isPowerCold) powerEquipmentIds.add(equipmentId);
    if (cls === 'geladeira_degelo') degeloPreferred.add(equipmentId);
  });

  const compacted = compactPowerColdClusters(coldEquipmentIds, plan, powerEquipmentIds, degeloPreferred);

  return {
    plan:compacted.plan,
    degeloPreferredEquipmentIds:[...compacted.degeloPreferredEquipmentIds],
  };
}

function planStreetColdEquipmentTypes(state, { streetId, equipmentIds, remainingEntries, levelMode }) {
  const counts = { freezer:0, geladeira_alta:0, geladeira_degelo:0, geladeira:0 };
  (remainingEntries || []).forEach((entryId) => {
    const code = resolveBoardEntryProductCode(entryId);
    const cls = fillProductColdClass(code);
    if (counts[cls] != null) counts[cls] += 1;
  });
  const coldDemand = counts.freezer + counts.geladeira_alta + counts.geladeira_degelo + counts.geladeira;
  if (!coldDemand) return { mapStructure:state.mapStructure, typePlan:{}, degeloPreferredEquipmentIds:[] };

  const coldEquipmentIds = (equipmentIds || []).filter((equipmentId) => {
    const eq = equipmentById(state.mapStructure, equipmentId);
    return eq && isColdEquipmentType(eq.tipo);
  });
  if (!coldEquipmentIds.length) return { mapStructure:state.mapStructure, typePlan:{}, degeloPreferredEquipmentIds:[] };

  const { plan:rawPlan, degeloPreferredEquipmentIds } = buildColdTypePlanFromPriority(
    state,
    state.mapStructure,
    streetId,
    coldEquipmentIds,
    prioritizeStreetFillEntries(remainingEntries),
    levelMode,
  );
  const typePlan = {};
  coldEquipmentIds.forEach((equipmentId) => {
    const plannedType = rawPlan[equipmentId] || 'geladeira';
    const eq = equipmentById(state.mapStructure, equipmentId);
    if (!eq || eq.tipo === plannedType) return;
    typePlan[equipmentId] = plannedType;
  });
  const plannedMap = mapWithEquipmentTypePlan(state.mapStructure, typePlan);
  return { mapStructure:plannedMap, typePlan, degeloPreferredEquipmentIds };
}

function summarizeNumberList(numbers) {
  return (numbers || [])
    .slice()
    .sort((a, b) => Number(a) - Number(b))
    .map((number) => String(number).padStart(3, '0'))
    .join(', ');
}

function equipmentSummaryLabel(eq, allocations) {
  const tipo = normalizeSearchText(eq?.tipo || '');
  let degeloNao = 0;
  let occupied = 0;
  for (let level = 1; level <= (eq?.niveis || 0); level += 1) {
    for (let pos = 1; pos <= (eq?.escsPerNivel || 0); pos += 1) {
      const alloc = allocations[`${eq.id}-${level}-${pos}`] || {};
      ['p1', 'p2'].forEach((slot) => {
        const code = resolveBoardEntryProductCode(alloc[slot]);
        const product = PRODUCT_MAP[code];
        if (!product) return;
        occupied += 1;
        if (product.degelo === 'NÃO') degeloNao += 1;
      });
    }
  }
  const isGeladeira = tipo.includes('geladeira') || tipo.includes('refriger');
  if (isGeladeira && occupied > 0 && degeloNao / occupied >= 0.5) return 'geladeira de gerador';
  if (tipo.includes('freezer')) return 'freezer';
  if (isGeladeira && tipo.includes('alta')) return 'geladeira alta';
  if (isGeladeira) return 'geladeira';
  if (tipo.includes('prateleira') || tipo.includes('pamplona') || tipo.includes('lateral')) return 'prateleira';
  return eq?.tipo || 'equipamento';
}

function buildEquipmentSummaryText(state) {
  const preferredOrder = ['geladeira de gerador', 'geladeira alta', 'geladeira', 'freezer', 'prateleira'];
  const lines = [];
  (state.mapStructure || []).forEach((street) => {
    const groups = {};
    (street.equipment || []).forEach((eq) => {
      const parsed = parseEscaninhoId(`${eq.id}-1-1`);
      const number = parsed.equipId ? parseInt(String(parsed.equipId).split('-').pop().replace(/^E/i, ''), 10) : NaN;
      if (!Number.isFinite(number)) return;
      const label = equipmentSummaryLabel(eq, state.allocations);
      if (!groups[label]) groups[label] = [];
      groups[label].push(number);
    });
    lines.push(`${street.id}:`);
    const orderedLabels = preferredOrder.filter((label) => groups[label]);
    orderedLabels.push(...Object.keys(groups).filter((label) => !preferredOrder.includes(label)).sort());
    orderedLabels.forEach((label) => {
      const numbers = summarizeNumberList(groups[label]);
      const verb = groups[label].length === 1 ? 'é' : 'são';
      lines.push(`${numbers} ${verb} ${label}`);
    });
    lines.push('');
  });
  return lines.join('\n').trim();
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ dialog, onConfirm, onCancel }) {
  const [inp, setInp] = useState('');
  useEffect(()=>{ setInp(''); },[dialog]);
  if (!dialog) return null;
  const ok = !dialog.requireText || inp===dialog.requireText;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={onCancel} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', background:'var(--cfg-surface)', border:'1px solid var(--cfg-border)', borderRadius:10, padding:'20px 24px', width:380, boxShadow:'0 24px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--cfg-text)', marginBottom:6 }}>{dialog.title}</div>
        <div style={{ fontSize:12, color:'var(--cfg-text-muted)', marginBottom:16, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html:dialog.message }} />
        {dialog.requireText && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:'var(--cfg-text-muted)', marginBottom:4 }}>Digite <strong style={{ color:'var(--cfg-text)' }}>"{dialog.requireText}"</strong> para confirmar:</div>
            <input value={inp} onChange={e=>setInp(e.target.value)} autoFocus
              style={{ width:'100%', padding:'7px 10px', fontSize:11, background:'var(--cfg-input-bg)', border:'1px solid var(--cfg-border)', borderRadius:5, color:'var(--cfg-text)', outline:'none' }} />
          </div>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'7px 14px', fontSize:11, fontWeight:700, borderRadius:5, cursor:'pointer', background:'transparent', border:'1px solid var(--cfg-border)', color:'var(--cfg-text-muted)', fontFamily:'var(--font-sans)' }}>Cancelar</button>
          <button onClick={onConfirm} disabled={!ok} style={{ padding:'7px 14px', fontSize:11, fontWeight:700, borderRadius:5, cursor:'pointer', fontFamily:'var(--font-sans)', border:'none', background:dialog.danger?'#9E1028':'var(--shopper-green)', color:'#fff', opacity:ok?1:0.4 }}>
            {dialog.confirmLabel||'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Search bar with dropdown ──────────────────────────────────────────────────
function SearchBar({ allocations, onHighlight }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const results = useMemo(()=>{
    if (!query||query.length<2) return [];
    const q = normalizeSearchText(query);
    return PRODUCTS
      .filter(p=>normalizeSearchText(p.nome).includes(q)||normalizeSearchText(p.id).includes(q))
      .slice(0,9)
      .map(p=>{
        const locs=[];
        Object.entries(allocations).forEach(([k,a])=>{
          if(resolveBoardEntryProductCode(a?.p1)===p.id||resolveBoardEntryProductCode(a?.p2)===p.id) locs.push(k);
        });
        return { product:p, locs };
      });
  },[query, allocations]);

  // Close on outside click
  useEffect(()=>{
    const h=e=>{ if(wrapRef.current&&!wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  const handleSelect = (r) => {
    onHighlight(r.product.id, r.locs);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.35)', fontSize:12, pointerEvents:'none' }}>⌕</span>
        <input value={query}
          onChange={e=>{ setQuery(e.target.value); setOpen(true); }}
          onFocus={()=>setOpen(true)}
          placeholder="Buscar produto, código…"
          style={{ padding:'5px 28px 5px 28px', fontSize:11, width:220, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:20, color:'rgba(255,255,255,0.88)', outline:'none', fontFamily:'var(--font-sans)' }} />
        {query && (
          <button onClick={()=>{ setQuery(''); setOpen(false); onHighlight(null,[]); }}
            style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:12, lineHeight:1, padding:0 }}>
            ✕
          </button>
        )}
      </div>
      {open && results.length>0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, width:320, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:8, boxShadow:'0 12px 36px rgba(0,0,0,0.28)', zIndex:300, overflow:'hidden' }}>
          <div style={{ padding:'5px 12px 4px', fontSize:9, fontWeight:700, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', borderBottom:'1px solid var(--dropdown-border)' }}>
            {results.length} resultado{results.length!==1?'s':''}
          </div>
          {results.map(r=>{
            const gs = GROUP_STYLE[r.product.grupo]||GROUP_STYLE.Neutro;
            const groupColor = gs.text || '#94A3B8';
            return (
              <button key={r.product.id} onClick={()=>handleSelect(r)}
                style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:'transparent' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:24, height:24, borderRadius:5, background:`${groupColor}20`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:groupColor }}>{r.product.curva}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--dropdown-text)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{r.product.nome}</div>
                  <div style={{ display:'flex', gap:5, marginTop:1, alignItems:'center' }}>
                    <span style={{ fontSize:9, color:gs.text, fontWeight:700 }}>{gs.label}</span>
                    <span style={{ fontSize:9, color:'var(--map-text-muted)' }}>·</span>
                    <span style={{ fontSize:9, color:'var(--map-text-muted)' }}>
                      {r.locs.length>0 ? `${r.locs.length} escaninho${r.locs.length!==1?'s':''} · ${r.locs[0]}` : 'Não alocado'}
                    </span>
                  </div>
                </div>
                {r.locs.length>0 && <span style={{ fontSize:10, fontWeight:700, color:'#0DAB77', flexShrink:0 }}>↗</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ALL_SUBCATS = [...new Set(PRODUCTS.map(p => p.sub))].sort();

function CategoryFilter({ subcatFilters, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    if (!search) return ALL_SUBCATS;
    const q = normalizeSearchText(search);
    return ALL_SUBCATS.filter((sub) => normalizeSearchText(sub).includes(q));
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (sub) => {
    if (subcatFilters.includes(sub)) onChange(subcatFilters.filter((value) => value !== sub));
    else onChange([...subcatFilters, sub]);
  };

  return (
    <div ref={wrapRef} style={{ display:'flex', alignItems:'center', gap:4, position:'relative' }}>
      {subcatFilters.map((sub) => (
        <div key={sub} style={{ display:'flex', alignItems:'center', gap:3, padding:'2px 6px 2px 8px', background:'rgba(13,171,119,0.18)', border:'1px solid rgba(13,171,119,0.4)', borderRadius:10, fontSize:9, fontWeight:700, color:'#3DD4A6', whiteSpace:'nowrap', fontFamily:'var(--font-sans)' }}>
          {sub}
          <button onClick={() => toggle(sub)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(61,212,166,0.7)', fontSize:10, lineHeight:1, padding:0, display:'flex' }}>×</button>
        </div>
      ))}
      <button onClick={() => { setOpen((value) => !value); setSearch(''); }} title="Filtrar por subcategoria" style={{ width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', background:subcatFilters.length > 0 ? 'rgba(13,171,119,0.22)' : 'rgba(255,255,255,0.08)', border:subcatFilters.length > 0 ? '1px solid rgba(13,171,119,0.5)' : '1px solid rgba(255,255,255,0.15)', borderRadius:4, cursor:'pointer', color:subcatFilters.length > 0 ? '#3DD4A6' : 'rgba(255,255,255,0.55)' }}>
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
          <path d="M1 2h10l-4 5v3l-2-1V7L1 2z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:500, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:8, boxShadow:'0 12px 36px rgba(0,0,0,0.32)', minWidth:210, overflow:'hidden' }}>
          <div style={{ padding:'8px 10px 4px' }}>
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar subcategoria…" style={{ width:'100%', boxSizing:'border-box', padding:'5px 8px', fontSize:11, background:'rgba(255,255,255,0.06)', border:'1px solid var(--dropdown-border)', borderRadius:5, color:'var(--dropdown-text)', outline:'none', fontFamily:'var(--font-sans)' }} />
          </div>
          <div style={{ maxHeight:220, overflowY:'auto', padding:'4px 0 6px' }}>
            {filtered.length === 0 && <div style={{ padding:'8px 12px', fontSize:10, color:'var(--map-text-muted)' }}>Nenhum resultado</div>}
            {filtered.map((sub) => {
              const selected = subcatFilters.includes(sub);
              return (
                <button key={sub} onClick={() => toggle(sub)} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 12px', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:selected ? 'rgba(13,171,119,0.12)' : 'transparent' }} onMouseEnter={(event) => { if (!selected) event.currentTarget.style.background = 'var(--dropdown-hover)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = selected ? 'rgba(13,171,119,0.12)' : 'transparent'; }}>
                  <div style={{ width:14, height:14, borderRadius:3, flexShrink:0, border:selected ? 'none' : '1px solid var(--dropdown-border)', background:selected ? '#0DAB77' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {selected && <span style={{ fontSize:9, color:'#fff', lineHeight:1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize:11, color:selected ? 'var(--shopper-green)' : 'var(--dropdown-text)', fontWeight:selected ? 700 : 400 }}>{sub}</span>
                </button>
              );
            })}
          </div>
          {subcatFilters.length > 0 && (
            <div style={{ borderTop:'1px solid var(--dropdown-border)', padding:'6px 10px' }}>
              <button onClick={() => { onChange([]); setOpen(false); }} style={{ width:'100%', padding:'4px', fontSize:9, fontWeight:700, background:'transparent', border:'1px solid var(--dropdown-border)', borderRadius:4, cursor:'pointer', color:'var(--map-text-muted)', fontFamily:'var(--font-sans)' }}>
                Limpar filtros de categoria
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reducer ───────────────────────────────────────────────────────────────────
const initMapStructure = JSON.parse(JSON.stringify(STREETS_STRUCTURE));
const DEFAULT_EQUIP_SHAPES = {
  prateleira:{niveis:5,escsPerNivel:7,cap:30.24},
  prateleira_pamplona:{niveis:3,escsPerNivel:7,cap:30.24,card175Only:true},
  geladeira:{niveis:5,escsPerNivel:5,cap:20},
  geladeira_alta:{niveis:4,escsPerNivel:5,cap:20},
  geladeira_gerador:{niveis:5,escsPerNivel:5,cap:20},
  freezer:{niveis:5,escsPerNivel:5,cap:16.384},
  quimico:{niveis:5,escsPerNivel:7,cap:30.24},
};
function getInitialEquipType(equipId) {
  for (const street of initMapStructure) {
    const equip = (street.equipment || []).find(item=>item.id===equipId);
    if (equip) return equip.tipo;
  }
  return null;
}
function getEquipShapeForType(mapStructure, tipo, excludeEquipId) {
  const targetType = String(tipo || '').trim();
  if (!targetType) return {};
  const sources = [mapStructure || [], initMapStructure || []];
  for (const streets of sources) {
    for (const street of streets) {
      for (const equip of (street.equipment || [])) {
        if (equip.id !== excludeEquipId && equip.tipo === targetType && equip.niveis && equip.escsPerNivel) {
          return {
            niveis:equip.niveis,
            escsPerNivel:equip.escsPerNivel,
            cap:equip.cap,
          };
        }
      }
    }
  }
  return DEFAULT_EQUIP_SHAPES[targetType] || {};
}
const initState = {
  view:'config', configOpen:false, selectedStore:inferSelectedStoreFromBootstrap(),
  allocations:{ ...INITIAL_ALLOCATIONS },
  history:[{ allocations:{ ...INITIAL_ALLOCATIONS }, unallocated:[...INITIAL_UNALLOCATED], collected:[] }], histIdx:0,
  lastHistoryGroup:null,
  selectedProduct:null, mode2aLeva:false, pranchetaOpen:true, openPanel:null,
  collected:[], unallocated:[...INITIAL_UNALLOCATED], searchQuery:'',
  mapStructure:initMapStructure, equipCollapsed:{}, streetCollapsed:{},
  pendingEquipmentTypeChanges:{},
  quickActionMessage:'',
  pendingConfirm:null,
  swapSource:null,
  highlightProductId:null,
  subcatFilters:[],
  globalEquipmentFilter:'all',
};

function historySnapshot(state, allocations, unallocated, collected) {
  return {
    allocations:{ ...(allocations || state.allocations) },
    unallocated:[ ...(unallocated || state.unallocated) ],
    collected:[ ...(collected || state.collected) ],
  };
}

function readHistorySnapshot(item) {
  if (!item || item.allocations) return item || {};
  return { allocations:item, unallocated:null, collected:null };
}

function commitAllocs(state, newAllocs, historyGroup, nextLists) {
  const normalizedGroup = historyGroup || null;
  const nextUnallocated = nextLists && nextLists.unallocated ? nextLists.unallocated : state.unallocated;
  const nextCollected = nextLists && nextLists.collected ? nextLists.collected : state.collected;
  const snapshot = historySnapshot(state, newAllocs, nextUnallocated, nextCollected);
  const canReplaceLast =
    normalizedGroup &&
    state.lastHistoryGroup === normalizedGroup &&
    state.histIdx === state.history.length - 1 &&
    state.history.length > 1;
  if (canReplaceLast) {
    const history = [...state.history];
    history[state.histIdx] = snapshot;
    return { ...state, allocations:newAllocs, unallocated:nextUnallocated, collected:nextCollected, history, lastHistoryGroup:normalizedGroup };
  }
  const h=[...state.history.slice(0,state.histIdx+1), snapshot];
  return {...state, allocations:newAllocs, unallocated:nextUnallocated, collected:nextCollected, history:h, histIdx:h.length-1, lastHistoryGroup:normalizedGroup};
}

function findEquip(mapStructure, equipId) {
  for (const st of mapStructure) {
    const eq = st.equipment.find(e=>e.id===equipId);
    if (eq) return eq;
  }
  return null;
}

function collectPlacements(allocations) {
  const placements = {};
  Object.entries(allocations || {}).forEach(([escId, alloc]) => {
    ['p1', 'p2'].forEach((slotKey) => {
      const code = alloc && alloc[slotKey];
      if (!code) return;
      if (!placements[code]) placements[code] = [];
      placements[code].push(escId);
    });
  });
  return placements;
}

function backendMetaForEscaninho(escaninhoId, mapStructure, pendingEquipmentTypeChanges) {
  const slotMeta = BOOTSTRAP.SLOT_META || {};
  const existing = slotMeta[escaninhoId];
  const parsed = parseEscaninhoId(escaninhoId);
  if (!pendingEquipmentTypeChanges || !pendingEquipmentTypeChanges[parsed.equipId]) return existing;
  const eq = findEquip(mapStructure, parsed.equipId);
  if (!eq) return existing;
  const anyEqMeta = Object.values(slotMeta).find((meta) => meta && meta.equipId === parsed.equipId);
  const sampleLocation = String(anyEqMeta?.locationId || anyEqMeta?.backendBinId || '');
  const galpaoMatch = sampleLocation.match(/(?:bin-)?([A-Z]{2}\d+)-R/i);
  const galpaoId = galpaoMatch ? galpaoMatch[1] : 'LJ000000';
  const equipNum = parseInt(String(parsed.equipId).split('-').pop() || '', 10);
  const ruaPart = String(parsed.equipId).split('-')[0] || '';
  const ruaNum = ruaPart.replace(/^R/i, '');
  if (!ruaNum || !Number.isFinite(equipNum) || !parsed.level || !parsed.pos) return existing;
  const posLetter = String.fromCharCode(64 + parsed.pos);
  const heightNumber = Math.max(1, (eq.niveis || parsed.level) - parsed.level + 1);
  const locationId = `${galpaoId}-R${ruaNum}-${String(equipNum).padStart(3, '0')}-${heightNumber}${posLetter}`;
  return {
    escId:escaninhoId,
    locationId,
    backendBinId:'bin-' + locationId,
    equipId:parsed.equipId,
    ruaNum,
    equipNum,
    level:parsed.level,
    pos:parsed.pos,
  };
}

function diffMoves(currentAllocations, mapStructure, pendingEquipmentTypeChanges) {
  const original = BOOTSTRAP.INITIAL_PLACEMENTS || {};
  const current = collectPlacements(currentAllocations);
  const rawMap = BOOTSTRAP.RAW_PRODUCT_DATA_MAP || {};
  const allCodes = new Set([...Object.keys(original), ...Object.keys(current)]);
  const moves = [];

  allCodes.forEach((code) => {
    const originalList = [...(original[code] || [])];
    const currentList = [...(current[code] || [])];
    const currentSet = new Set(currentList);
    const kept = new Set();

    originalList.forEach((escId) => {
      if (currentSet.has(escId) && !kept.has(escId)) kept.add(escId);
    });

    const remainingOriginal = originalList.filter((escId) => !kept.has(escId));
    const remainingCurrent = currentList.filter((escId) => !kept.has(escId));
    const pairs = Math.min(remainingOriginal.length, remainingCurrent.length);

    for (let i = 0; i < pairs; i += 1) {
      const src = backendMetaForEscaninho(remainingOriginal[i], mapStructure, pendingEquipmentTypeChanges);
      const dst = backendMetaForEscaninho(remainingCurrent[i], mapStructure, pendingEquipmentTypeChanges);
      if (!src || !dst) continue;
      moves.push({
        productCode: code,
        productName: PRODUCT_MAP[code] ? PRODUCT_MAP[code].nome : code,
        productInfo: rawMap[code] || {},
        locAnteriorId: src.backendBinId,
        locNovoId: dst.backendBinId,
      });
    }

    for (let i = pairs; i < remainingOriginal.length; i += 1) {
      const src = backendMetaForEscaninho(remainingOriginal[i], mapStructure, pendingEquipmentTypeChanges);
      if (!src) continue;
      moves.push({
        productCode: code,
        productName: PRODUCT_MAP[code] ? PRODUCT_MAP[code].nome : code,
        productInfo: rawMap[code] || {},
        locAnteriorId: src.backendBinId,
        locNovoId: 'UNALLOCATED',
      });
    }

    for (let i = pairs; i < remainingCurrent.length; i += 1) {
      const dst = backendMetaForEscaninho(remainingCurrent[i], mapStructure, pendingEquipmentTypeChanges);
      if (!dst) continue;
      moves.push({
        productCode: code,
        productName: PRODUCT_MAP[code] ? PRODUCT_MAP[code].nome : code,
        productInfo: rawMap[code] || {},
        locAnteriorId: 'UNALLOCATED',
        locNovoId: dst.backendBinId,
      });
    }
  });

  return moves;
}

function collectAllocationKeys(state, shouldCollectKey) {
  const allocations = { ...state.allocations };
  const collected = [ ...state.collected ];
  let changed = false;
  Object.keys(allocations).forEach((key) => {
    if (!shouldCollectKey(key)) return;
    const alloc = allocations[key] || {};
    if (alloc.p1) collected.push(createCollectedEntryId(alloc.p1, collected));
    if (alloc.p2) collected.push(createCollectedEntryId(alloc.p2, collected));
    delete allocations[key];
    changed = true;
  });
  return { allocations, collected, changed };
}

function compactCardOnlyAllocations(mapStructure, allocations) {
  const compacted = { ...allocations };
  (mapStructure || []).forEach((street) => {
    (street.equipment || []).forEach((eq) => {
      if (!eq.card175Only) return;
      const contents = [];
      for (let n=1;n<=eq.niveis;n++) for (let s=1;s<=eq.escsPerNivel;s++) {
        const key = `${eq.id}-${n}-${s}`;
        if (compacted[key]?.p1 || compacted[key]?.p2) contents.push(compacted[key]);
        delete compacted[key];
      }
      contents.forEach((value, index) => {
        const level = Math.floor(index / eq.escsPerNivel) + 1;
        const pos = (index % eq.escsPerNivel) + 1;
        compacted[`${eq.id}-${level}-${pos}`] = value;
      });
    });
  });
  return compacted;
}

function pendingStateFingerprint(state) {
  return JSON.stringify({
    allocations: state.allocations,
    mapStructure: state.mapStructure,
  });
}

function reducer(state, action) {
  switch(action.type) {
    case 'OPEN_MAP':        return {...state, view:'map', configOpen:false};
    case 'TOGGLE_CONFIG':   return {...state, configOpen:!state.configOpen};
    case 'SET_STORE':
      persistSelectedStore(action.store);
      return {...state, selectedStore:action.store};
    case 'OPEN_PANEL':      return {...state, openPanel:action.panel};
    case 'CLOSE_PANEL':     return {...state, openPanel:null, configOpen:false};
    case 'TOGGLE_PRANCHETA':return {...state, pranchetaOpen:!state.pranchetaOpen};
    case 'SELECT_PRODUCT':  return {...state, selectedProduct:action.productId};
    case 'TOGGLE_2A_LEVA':  return {...state, mode2aLeva:!state.mode2aLeva};
    case 'SET_SEARCH':      return {...state, searchQuery:action.query};
    case 'SET_SUBCAT_FILTERS': return {...state, subcatFilters:action.filters};
    case 'SET_GLOBAL_EQUIP_FILTER': return {...state, globalEquipmentFilter:action.filter || 'all'};
    case 'SET_CONFIRM':     return {...state, pendingConfirm:action.dialog};
    case 'CLEAR_CONFIRM':   return {...state, pendingConfirm:null};
    case 'TOGGLE_EQUIP':    return {...state, equipCollapsed:{...state.equipCollapsed,[action.id]:!state.equipCollapsed[action.id]}};
    case 'TOGGLE_STREET':   return {...state, streetCollapsed:{...state.streetCollapsed,[action.id]:!state.streetCollapsed[action.id]}};
    case 'EXPAND_ALL':      return {...state, equipCollapsed:{}, streetCollapsed:{}};
    case 'COLLAPSE_ALL': {
      const ec={},sc={};
      state.mapStructure.forEach(st=>{ sc[st.id]=true; st.equipment.forEach(eq=>{ec[eq.id]=true;}); });
      return {...state, equipCollapsed:ec, streetCollapsed:sc};
    }
    case 'SET_SWAP_SOURCE':  return {...state, swapSource:action.equipId};
    case 'CLEAR_SWAP_SOURCE':return {...state, swapSource:null};
    case 'SET_HIGHLIGHT':    return {...state, highlightProductId:action.productId};
    case 'HIGHLIGHT_AND_NAVIGATE': {
      const { productId, locs } = action;
      const equipCollapsed = { ...state.equipCollapsed };
      const streetCollapsed = { ...state.streetCollapsed };
      (locs || []).forEach((loc) => {
        const parts = String(loc).split('-');
        const streetId = parts[0];
        const equipId = parts.slice(0, 2).join('-');
        delete equipCollapsed[equipId];
        delete streetCollapsed[streetId];
      });
      return { ...state, highlightProductId:productId, equipCollapsed, streetCollapsed };
    }
    case 'CLEAR_HIGHLIGHT':  return {...state, highlightProductId:null};
    case 'COLLAPSE_STREET_EQUIPS': {
      const street = state.mapStructure.find((item) => item.id === action.streetId);
      if (!street) return state;
      const equipCollapsed = { ...state.equipCollapsed };
      street.equipment.forEach((eq) => { equipCollapsed[eq.id] = true; });
      return { ...state, equipCollapsed };
    }
    case 'EXPAND_STREET_EQUIPS': {
      const street = state.mapStructure.find((item) => item.id === action.streetId);
      if (!street) return state;
      const equipCollapsed = { ...state.equipCollapsed };
      street.equipment.forEach((eq) => { delete equipCollapsed[eq.id]; });
      return { ...state, equipCollapsed };
    }

    case 'ALLOCATE': {
      const {escaninhoId,productId,slot,historyGroup}=action;
      const productCode = resolveBoardEntryProductCode(productId);
      if (!productCode) return state;
      const prev=state.allocations[escaninhoId]||{p1:null,p2:null};
      const na=slot===2?{p1:prev.p1,p2:productCode}:{p1:productCode,p2:prev.p2};
      const newA={...state.allocations,[escaninhoId]:na};
      const nextCollected = state.collected.filter(id=>id!==productId);
      const nextUnallocated = state.unallocated.filter(id=>id!==productId);
      return {
        ...commitAllocs(state,newA,historyGroup,{ collected:nextCollected, unallocated:nextUnallocated }),
        selectedProduct:null,
      };
    }
    case 'ALLOCATE_BATCH': {
      const moves = Array.isArray(action.moves) ? action.moves : [];
      if (!moves.length) return state;
      const newA = { ...state.allocations };
      const usedProductIds = new Set();
      moves.forEach((move) => {
        const productCode = resolveBoardEntryProductCode(move.productId);
        if (!productCode || !move.escaninhoId) return;
        const prev = newA[move.escaninhoId] || { p1:null, p2:null };
        newA[move.escaninhoId] = Number(move.slot) === 2
          ? { p1:prev.p1, p2:productCode }
          : { p1:productCode, p2:prev.p2 };
        usedProductIds.add(move.productId);
      });
      const nextCollected = state.collected.filter((id) => !usedProductIds.has(id));
      const nextUnallocated = state.unallocated.filter((id) => !usedProductIds.has(id));
      return {
        ...commitAllocs(state, newA, action.historyGroup, { collected:nextCollected, unallocated:nextUnallocated }),
        selectedProduct:null,
      };
    }
    case 'COLLECT': {
      const {escaninhoId,product}=action;
      const prev=state.allocations[escaninhoId]||{p1:null,p2:null};
      const na={p1:prev.p2||null,p2:null};
      const newA={...state.allocations,[escaninhoId]:na};
      if(!na.p1) delete newA[escaninhoId];
      const collectedEntryId = createCollectedEntryId(product.id, state.collected);
      const nextCollected = [collectedEntryId, ...state.collected];
      return {
        ...commitAllocs(state,newA,null,{ collected:nextCollected, unallocated:state.unallocated }),
        selectedProduct:null,
      };
    }
    case 'ALLOCATE_MANY': {
      const items = Array.isArray(action.items) ? action.items : [];
      if (!items.length) return state;
      const newA = { ...state.allocations };
      const collectedToRemove = new Set();
      const unallocatedToRemove = new Set();
      items.forEach(({ escaninhoId, productId, slot }) => {
        const productCode = resolveBoardEntryProductCode(productId);
        if (!productCode || !escaninhoId) return;
        const prev = newA[escaninhoId] || { p1:null, p2:null };
        newA[escaninhoId] = slot === 2 ? { p1:prev.p1, p2:productCode } : { p1:productCode, p2:prev.p2 };
        collectedToRemove.add(productId);
        unallocatedToRemove.add(productId);
      });
      const nextCollected = state.collected.filter(id=>!collectedToRemove.has(id));
      const nextUnallocated = state.unallocated.filter(id=>!unallocatedToRemove.has(id));
      return {
        ...commitAllocs(state,newA,null,{ collected:nextCollected, unallocated:nextUnallocated }),
        selectedProduct:null,
      };
    }
    case 'COLLECT_MANY': {
      const escaninhoIds = Array.isArray(action.escaninhoIds) ? action.escaninhoIds : [];
      if (!escaninhoIds.length) return state;
      const newA = { ...state.allocations };
      const newCollected = [...state.collected];
      escaninhoIds.forEach((escaninhoId) => {
        const prev = newA[escaninhoId] || { p1:null, p2:null };
        if (prev.p1) newCollected.push(createCollectedEntryId(prev.p1, newCollected));
        if (prev.p2) newCollected.push(createCollectedEntryId(prev.p2, newCollected));
        delete newA[escaninhoId];
      });
      return {
        ...commitAllocs(state,newA,null,{ collected:newCollected, unallocated:state.unallocated }),
        selectedProduct:null,
      };
    }
    case 'COLLECT_EQUIP': {
      const result = collectAllocationKeys(state, key=>key.startsWith(action.equipId + '-'));
      if (!result.changed) return state;
      return {
        ...commitAllocs(state,result.allocations,null,{ collected:result.collected, unallocated:state.unallocated }),
        selectedProduct:null,
      };
    }
    case 'REGROUP_PARTIAL_PRODUCTS': {
      const codes = new Set((action.productCodes || []).map(code=>String(code || '').trim().toUpperCase()).filter(Boolean));
      if (!codes.size) return state;
      const newA = { ...state.allocations };
      const nextUnallocated = [ ...state.unallocated ];
      let changed = false;
      Object.keys(newA).forEach((key) => {
        const alloc = newA[key] || {};
        let p1 = alloc.p1;
        let p2 = alloc.p2;
        if (p1 && codes.has(String(p1).trim().toUpperCase())) {
          nextUnallocated.push(createUnallocatedEntryId(p1, nextUnallocated));
          p1 = null;
          changed = true;
        }
        if (p2 && codes.has(String(p2).trim().toUpperCase())) {
          nextUnallocated.push(createUnallocatedEntryId(p2, nextUnallocated));
          p2 = null;
          changed = true;
        }
        if (!p1 && p2) {
          p1 = p2;
          p2 = null;
        }
        if (p1 || p2) newA[key] = { p1:p1 || null, p2:p2 || null };
        else delete newA[key];
      });
      if (!changed) return state;
      const compacted = compactCardOnlyAllocations(state.mapStructure, newA);
      return {
        ...commitAllocs(state,compacted,null,{ collected:state.collected, unallocated:nextUnallocated }),
        selectedProduct:null,
        quickActionMessage:`${action.productCodes.length} produto(s) recolhido(s) por completo e devolvido(s) para Não alocados.`,
      };
    }
    case 'UNDO': {
      if(state.histIdx<=0) return state;
      const ni=state.histIdx-1;
      const snapshot = readHistorySnapshot(state.history[ni]);
      return {
        ...state,
        histIdx:ni,
        allocations:{...(snapshot.allocations || {})},
        unallocated:snapshot.unallocated ? [...snapshot.unallocated] : state.unallocated,
        collected:snapshot.collected ? [...snapshot.collected] : state.collected,
        lastHistoryGroup:null,
      };
    }
    case 'REDO': {
      if(state.histIdx>=state.history.length-1) return state;
      const ni=state.histIdx+1;
      const snapshot = readHistorySnapshot(state.history[ni]);
      return {
        ...state,
        histIdx:ni,
        allocations:{...(snapshot.allocations || {})},
        unallocated:snapshot.unallocated ? [...snapshot.unallocated] : state.unallocated,
        collected:snapshot.collected ? [...snapshot.collected] : state.collected,
        lastHistoryGroup:null,
      };
    }

    // ── Swap CONTENTS between two equipment (IDs and types unchanged) ───────
    case 'SWAP_EQUIP_CONTENTS': {
      const {equipA,equipB}=action;
      const eqA=findEquip(state.mapStructure,equipA);
      const eqB=findEquip(state.mapStructure,equipB);
      if(!eqA||!eqB) return state;
      // Snapshot both sets of allocations keyed by "nivel-slot"
      const aSnap={}, bSnap={};
      for(let n=1;n<=eqA.niveis;n++) for(let s=1;s<=eqA.escsPerNivel;s++){
        const v=state.allocations[`${equipA}-${n}-${s}`]; if(v) aSnap[`${n}-${s}`]=v;
      }
      for(let n=1;n<=eqB.niveis;n++) for(let s=1;s<=eqB.escsPerNivel;s++){
        const v=state.allocations[`${equipB}-${n}-${s}`]; if(v) bSnap[`${n}-${s}`]=v;
      }
      const newA={...state.allocations};
      // Clear both
      for(let n=1;n<=eqA.niveis;n++) for(let s=1;s<=eqA.escsPerNivel;s++) delete newA[`${equipA}-${n}-${s}`];
      for(let n=1;n<=eqB.niveis;n++) for(let s=1;s<=eqB.escsPerNivel;s++) delete newA[`${equipB}-${n}-${s}`];
      // Write B's content into A's slots
      for(let n=1;n<=eqA.niveis;n++) for(let s=1;s<=eqA.escsPerNivel;s++){
        const v=bSnap[`${n}-${s}`]; if(v) newA[`${equipA}-${n}-${s}`]=v;
      }
      // Write A's content into B's slots
      for(let n=1;n<=eqB.niveis;n++) for(let s=1;s<=eqB.escsPerNivel;s++){
        const v=aSnap[`${n}-${s}`]; if(v) newA[`${equipB}-${n}-${s}`]=v;
      }
      return {...commitAllocs(state,newA,null,{ collected:state.collected, unallocated:state.unallocated }), swapSource:null};
    }

    // ── Collect all products from a street ───────────────────────────────────
    case 'RECOLHER_RUA': {
      const street=state.mapStructure.find(s=>s.id===action.streetId);
      if(!street) return state;
      const newA={...state.allocations};
      const newCollected=[...state.collected];
      street.equipment.forEach(eq=>{
        for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){
          const key=`${eq.id}-${n}-${s}`, a=newA[key];
          if(a?.p1) newCollected.push(createCollectedEntryId(a.p1, newCollected));
          if(a?.p2) newCollected.push(createCollectedEntryId(a.p2, newCollected));
          delete newA[key];
        }
      });
      return {...commitAllocs(state,newA,null,{ collected:newCollected, unallocated:state.unallocated }),
        streetCollapsed:{...state.streetCollapsed, [action.streetId]:false}};
    }

    // ── Map structure mutations ──────────────────────────────────────────────
    case 'CHANGE_EQUIP_TYPE': {
      const shape = getEquipShapeForType(state.mapStructure, action.tipo, action.equipId);
      const pending = { ...(state.pendingEquipmentTypeChanges || {}) };
      const originalType = getInitialEquipType(action.equipId);
      if (!action.tipo || action.tipo === originalType) delete pending[action.equipId];
      else pending[action.equipId] = action.tipo;
      const nextNiveis = Number(shape.niveis || 0);
      const nextEscsPerNivel = Number(shape.escsPerNivel || 0);
      const ms=state.mapStructure.map(st=>({...st,equipment:st.equipment.map(eq=>{
        if(eq.id!==action.equipId) return eq;
        const changed = !!action.tipo && action.tipo !== originalType;
        const nextEq = {...eq,...shape,tipo:action.tipo};
        if (!eq.card175Only && nextEq.card175Only) delete nextEq.card175Only;
        if(changed) nextEq.tipoAnterior = originalType || eq.tipo;
        else delete nextEq.tipoAnterior;
        return nextEq;
      })}));
      const result = collectAllocationKeys(state, key=>{
        if (!key.startsWith(action.equipId + '-')) return false;
        const parsed = parseEscaninhoId(key);
        if (!nextNiveis || !nextEscsPerNivel) return false;
        return Number(parsed.level || 0) > nextNiveis || Number(parsed.pos || 0) > nextEscsPerNivel;
      });
      return {
        ...state,
        mapStructure:ms,
        allocations:result.allocations,
        collected:result.collected,
        selectedProduct:null,
        pendingEquipmentTypeChanges:pending,
      };
    }
    case 'APPLY_EQUIP_TYPE_PLAN': {
      const typePlan = action.typePlan || {};
      const pending = { ...(state.pendingEquipmentTypeChanges || {}) };
      const ms = state.mapStructure.map((street) => ({
        ...street,
        equipment:(street.equipment || []).map((eq) => {
          const nextType = typePlan[eq.id];
          if (!nextType || nextType === eq.tipo) return eq;
          const shape = getEquipShapeForType(state.mapStructure, nextType, eq.id);
          const originalType = getInitialEquipType(eq.id);
          if (!nextType || nextType === originalType) delete pending[eq.id];
          else pending[eq.id] = nextType;
          const changed = !!nextType && nextType !== originalType;
          const nextEq = { ...eq, ...shape, tipo:nextType };
          if (!eq.card175Only && nextEq.card175Only) delete nextEq.card175Only;
          if (changed) nextEq.tipoAnterior = originalType || eq.tipo;
          else delete nextEq.tipoAnterior;
          return nextEq;
        }),
      }));
      return { ...state, mapStructure:ms, pendingEquipmentTypeChanges:pending };
    }
    case 'CLEAR_PENDING_EQUIP_TYPE_CHANGES': {
      return {...state,pendingEquipmentTypeChanges:{}};
    }
    case 'REMOVE_EQUIP': {
      const ms=state.mapStructure.map(st=>({...st,equipment:st.equipment.filter(eq=>eq.id!==action.equipId)}));
      const result = collectAllocationKeys(state, key=>key.startsWith(action.equipId + '-'));
      const snapshot = historySnapshot(state, result.allocations, state.unallocated, result.collected);
      return {...state,mapStructure:ms,allocations:result.allocations,collected:result.collected,selectedProduct:null,history:[snapshot],histIdx:0,lastHistoryGroup:null};
    }
    case 'ADD_EQUIP': {
      const ms=state.mapStructure.map(st=>{
        if(st.id!==action.streetId) return st;
        const ai=action.afterEquipId?st.equipment.findIndex(eq=>eq.id===action.afterEquipId):st.equipment.length-1;
        const mx=Math.max(0,...st.equipment.map(eq=>parseInt(eq.id.split('-')[1]||'0')));
        const nid=`${st.id}-${String(mx+1).padStart(3,'0')}`;
        const arr=[...st.equipment];
        arr.splice(ai+1,0,{id:nid,tipo:action.tipo||'prateleira',niveis:5,escsPerNivel:7,cap:25.92});
        return {...st,equipment:arr};
      });
      return {...state,mapStructure:ms};
    }
    case 'ADD_STREET': {
      const streetNums=state.mapStructure.map(st=>parseInt(st.id.replace('R',''))).filter(Number.isFinite);
      const mx=Math.max(0,...streetNums);
      return {...state,mapStructure:[...state.mapStructure,{id:`R${mx+1}`,nome:`Rua ${mx+1}`,equipment:[]}]};
    }
    case 'REMOVE_STREET': {
      const removed=state.mapStructure.find(st=>st.id===action.streetId);
      const ms=state.mapStructure.filter(st=>st.id!==action.streetId);
      const removedEquipIds = new Set((removed?.equipment||[]).map(eq=>eq.id));
      const result = collectAllocationKeys(state, key=>removedEquipIds.has(String(key).split('-').slice(0,2).join('-')));
      const snapshot = historySnapshot(state, result.allocations, state.unallocated, result.collected);
      return {...state,mapStructure:ms,allocations:result.allocations,collected:result.collected,selectedProduct:null,history:[snapshot],histIdx:0,lastHistoryGroup:null};
    }

    case 'RENAME_EQUIP': {
      const {oldId,newId}=action;
      if(!newId||newId===oldId) return state;
      // Garantir unicidade
      let alreadyExists=false;
      state.mapStructure.forEach(st=>st.equipment.forEach(eq=>{ if(eq.id===newId) alreadyExists=true; }));
      if(alreadyExists) return state;
      // Atualizar estrutura + reordenar por número
      const ms=state.mapStructure.map(st=>({
        ...st,
        equipment:st.equipment
          .map(eq=>eq.id===oldId?{...eq,id:newId}:eq)
          .sort((a,b)=>{
            const aN=parseInt(a.id.split('-').pop()||'0');
            const bN=parseInt(b.id.split('-').pop()||'0');
            return aN-bN;
          }),
      }));
      // Remap allocation keys
      const na={};
      Object.entries(state.allocations).forEach(([k,v])=>{
        if(k.startsWith(oldId+'-')) na[newId+k.slice(oldId.length)]=v;
        else na[k]=v;
      });
      // Remap equipCollapsed
      const ec={...state.equipCollapsed};
      if(ec[oldId]!==undefined){ec[newId]=ec[oldId];delete ec[oldId];}
      return {...state,mapStructure:ms,allocations:na,equipCollapsed:ec};
    }

    default: return state;
  }
}

// ── Save Modal ──────────────────────────────────────────────────────────────────
function SaveModal({ onClose, onSaved, onSave }) {
  const activeSheet = BOOTSTRAP.ACTIVE_SHEET || null;
  const [name, setName]       = useState('');
  const [phase, setPhase]     = useState('input');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (phase === 'input') setTimeout(() => inputRef.current?.focus(), 60);
  }, [phase]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setPhase('saving');
    setProgress(0);
    setStatus('Preparando salvamento…');
    setError('');
    setSaveResult(null);
    try {
      setProgress(20);
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const result = await onSave(name.trim(), setProgress, setStatus);
      setProgress(100);
      setStatus('Versão salva com sucesso.');
      setSaveResult(result || null);
      setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('input');
    }
  };

  const versionSheetUrl = useMemo(() => {
    if (saveResult?.sheet_url) return saveResult.sheet_url;
    if (saveResult?.version_file_url) return saveResult.version_file_url;
    if (saveResult?.sheet_name && activeSheet?.sheet_id) {
      const encodedName = encodeURIComponent(saveResult.sheet_name);
      return `https://docs.google.com/spreadsheets/d/${activeSheet.sheet_id}/edit#gid=0&range=${encodedName}!A1`;
    }
    return '';
  }, [saveResult, activeSheet]);

  const planoSheetUrl = useMemo(() => {
    if (saveResult?.plano_sheet_url) return saveResult.plano_sheet_url;
    if (saveResult?.plano_file_url) return saveResult.plano_file_url;
    if (activeSheet?.sheet_id) {
      return `https://docs.google.com/spreadsheets/d/${activeSheet.sheet_id}/edit`;
    }
    return '';
  }, [saveResult, activeSheet]);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={phase==='input'?onClose:undefined} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', background:'var(--cfg-surface)', border:'1px solid var(--cfg-border)', borderRadius:12, padding:'28px', width:460, boxShadow:'0 24px 60px rgba(0,0,0,0.4)' }}>
        {phase === 'input' && (<>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--cfg-text)', marginBottom:6 }}>Salvar endereçamento</div>
          <div style={{ fontSize:12, color:'var(--cfg-text-muted)', marginBottom:18, lineHeight:1.5 }}>Escolha um nome para identificar esta versão.</div>
          {error && <div style={{ fontSize:11, color:'#EF4444', marginBottom:12 }}>{error}</div>}
          <input ref={inputRef} value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') handleSave(); if(e.key==='Escape') onClose(); }}
            placeholder="Ex: Pós-ETL semana 24, Re-FLV loja SP-01…"
            style={{ width:'100%', padding:'10px 12px', fontSize:12, background:'var(--cfg-input-bg)', border:'1px solid var(--cfg-border)', borderRadius:7, color:'var(--cfg-text)', outline:'none', marginBottom:18, fontFamily:'var(--font-sans)', boxSizing:'border-box' }} />
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'8px 16px', fontSize:11, fontWeight:700, borderRadius:6, cursor:'pointer', background:'transparent', border:'1px solid var(--cfg-border)', color:'var(--cfg-text-muted)', fontFamily:'var(--font-sans)' }}>Cancelar</button>
            <button onClick={handleSave} disabled={!name.trim()}
              style={{ padding:'8px 20px', fontSize:11, fontWeight:700, borderRadius:6, cursor:'pointer', fontFamily:'var(--font-sans)', border:'none', background:'var(--shopper-green)', color:'#fff', opacity:name.trim()?1:0.4 }}>
              Salvar versão
            </button>
          </div>
        </>)}
        {phase === 'saving' && (
          <div style={{ textAlign:'center', padding:'8px 0' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--cfg-text)', marginBottom:20 }}>Salvando <strong style={{ color:'var(--shopper-green)' }}>“{name}”</strong>…</div>
            <div style={{ height:8, background:'var(--cfg-border)', borderRadius:4, marginBottom:12, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${progress}%`, background:'var(--shopper-green)', borderRadius:4, transition:'width 0.04s linear' }} />
            </div>
            <div style={{ fontSize:32, fontWeight:800, color:'var(--shopper-green)', fontFamily:'var(--font-numeric)', lineHeight:1 }}>
              {progress}<span style={{ fontSize:16 }}>%</span>
            </div>
            <div style={{ fontSize:11, color:'var(--cfg-text-muted)', marginTop:10 }}>{status || 'Salvando versão…'}</div>
          </div>
        )}
        {phase === 'done' && (
          <div style={{ padding:'8px 0' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:36, color:'var(--shopper-green)', marginBottom:10 }}>✓</div>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--shopper-green)' }}>Versão salva com sucesso!</div>
              <div style={{ fontSize:10, color:'var(--cfg-text-muted)', marginTop:10, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 }}>Nome da versão</div>
              <div style={{ fontSize:18, color:'var(--cfg-text)', marginTop:4, fontWeight:800, lineHeight:1.35, wordBreak:'break-word' }}>{name}</div>
            </div>
            {(versionSheetUrl || planoSheetUrl) && (
              <div style={{ marginTop:18, background:'rgba(13,171,119,0.08)', border:'1px solid rgba(13,171,119,0.22)', borderRadius:8, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Links rápidos</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {versionSheetUrl && (
                    <a href={versionSheetUrl} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:800, color:'var(--shopper-green)', textDecoration:'none' }}>
                      Abrir aba da versão criada
                    </a>
                  )}
                  {planoSheetUrl && (
                    <a href={planoSheetUrl} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:800, color:'var(--shopper-green)', textDecoration:'none' }}>
                      Abrir Plano_Enderecamento_Final
                    </a>
                  )}
                </div>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
              <button onClick={() => { onSaved(name.trim(), saveResult || null); onClose(); }} style={{ padding:'8px 16px', fontSize:11, fontWeight:700, borderRadius:6, cursor:'pointer', background:'transparent', border:'1px solid var(--cfg-border)', color:'var(--cfg-text-muted)', fontFamily:'var(--font-sans)' }}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────────────
function TBtn({ label, icon, onClick, active, disabled, title }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} disabled={disabled} title={title||label}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 9px', borderRadius:5, cursor:disabled?'default':'pointer',
        border:active?'1px solid rgba(255,255,255,0.22)':'1px solid transparent',
        background:active?'rgba(255,255,255,0.12)':(h&&!disabled?'rgba(255,255,255,0.07)':'transparent'),
        color:disabled?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.85)',
        fontSize:11, fontWeight:600, fontFamily:'var(--font-sans)', flexShrink:0 }}>
      {icon&&<span style={{ fontSize:13, lineHeight:1 }}>{icon}</span>}
      {label&&<span>{label}</span>}
    </button>
  );
}

function ToolbarEyeIcon({ size=13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'block' }} aria-hidden="true">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ display:'block' }} aria-hidden="true">
      <path d="M1.3 2.2h9.4L7.1 6.35v2.9L4.9 10.1V6.35L1.3 2.2z" fill="currentColor" />
    </svg>
  );
}

function Sep() { return <div style={{ width:1, height:20, background:'rgba(255,255,255,0.13)', margin:'0 3px', flexShrink:0 }} />; }

const GLOBAL_EQUIP_FILTERS = [
  { id:'all', label:'Todos', short:'Todos' },
  { id:'prateleira', label:'Prateleiras', short:'Prateleiras' },
  { id:'geladeira', label:'Geladeiras', short:'Geladeiras' },
  { id:'freezer', label:'Freezers', short:'Freezers' },
];

function equipmentMatchesGlobalFilter(eq, filter) {
  if (!filter || filter === 'all') return true;
  const tipo = String(eq?.tipo || '').toLowerCase();
  const tipoAnterior = String(eq?.tipoAnterior || '').toLowerCase();
  const matches = (value) => {
    if (filter === 'prateleira') return value.includes('prateleira') || value.includes('pamplona') || value.includes('lateral');
    if (filter === 'geladeira') return value.includes('geladeira') || value.includes('refriger');
    if (filter === 'freezer') return value.includes('freezer');
    return value === filter;
  };
  return matches(tipo) || matches(tipoAnterior);
}

function GlobalEquipmentFilter({ state, dispatch }) {
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => {
    const next = { all:0, prateleira:0, geladeira:0, freezer:0 };
    (state.mapStructure || []).forEach((street) => {
      (street.equipment || []).forEach((eq) => {
        next.all += 1;
        ['prateleira', 'geladeira', 'freezer'].forEach((filter) => {
          if (equipmentMatchesGlobalFilter(eq, filter)) next[filter] += 1;
        });
      });
    });
    return next;
  }, [state.mapStructure]);
  const active = state.globalEquipmentFilter || 'all';
  const activeConfig = GLOBAL_EQUIP_FILTERS.find((item) => item.id === active) || GLOBAL_EQUIP_FILTERS[0];
  return (
    <div style={{ position:'relative' }}>
      <TBtn label={active === 'all' ? 'Equip.' : activeConfig.short} icon={<FilterIcon />} active={open || active !== 'all'} onClick={()=>setOpen(v=>!v)} title="Filtro global de equipamentos" />
      {open&&(<>
        <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:50 }} />
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:100, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:8, padding:'6px', minWidth:190, boxShadow:'0 12px 40px rgba(0,0,0,0.35)' }}>
          <div style={{ padding:'4px 8px 7px', fontSize:9, fontWeight:800, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Equipamentos no mapa</div>
          {GLOBAL_EQUIP_FILTERS.map((item) => (
            <button key={item.id} onClick={()=>{ dispatch({ type:'SET_GLOBAL_EQUIP_FILTER', filter:item.id }); setOpen(false); }}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 9px', borderRadius:5, border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:active===item.id?'rgba(13,171,119,0.12)':'transparent', color:active===item.id?'var(--shopper-green)':'var(--dropdown-text)', fontSize:11, fontWeight:700 }}
              onMouseEnter={e=>{ if (active!==item.id) e.currentTarget.style.background='var(--dropdown-hover)'; }}
              onMouseLeave={e=>{ if (active!==item.id) e.currentTarget.style.background='transparent'; }}>
              <span style={{ width:8, height:8, borderRadius:999, background:active===item.id?'var(--shopper-green)':'var(--dropdown-border)', flexShrink:0 }} />
              <span style={{ flex:1 }}>{item.label}</span>
              <span style={{ color:'var(--map-text-muted)', fontFamily:'var(--font-numeric)', fontSize:10 }}>{counts[item.id] || 0}</span>
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}

function ActionsDropdown({ dispatch, onExportAction }) {
  const [open,setOpen]=useState(false);
  const items=[
    {label:'Expandir todos',icon:'⊞',action:()=>dispatch({type:'EXPAND_ALL'})},
    {label:'Recolher todos',icon:'⊟',action:()=>dispatch({type:'COLLAPSE_ALL'})},
    {sep:true},
    {label:'Baixar XLSX atual',icon:'⬇',action:()=>API.download()},
    {sep:true},
    {label:'Gerar resumo de equipamentos',icon:'≡',action:()=>onExportAction('equipment-summary')},
    {label:'Gerar kdabra enderecar',icon:'⊞',action:()=>onExportAction('kdabta')},
    {label:'Gerar planilha KDABRA',icon:'⊞',action:()=>onExportAction('kdabra')},
  ];
  return (
    <div style={{ position:'relative' }}>
      <TBtn label="Ações" icon="⋯" active={open} onClick={()=>setOpen(v=>!v)} />
      {open&&(<>
        <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:50 }} />
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:100, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:8, padding:'4px', minWidth:230, boxShadow:'0 12px 40px rgba(0,0,0,0.35)' }}>
          {items.map((it,i)=>it.sep
            ?<div key={i} style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }}/>
            :<button key={i} onClick={()=>{it.action();setOpen(false);}} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', borderRadius:5, border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:'transparent', color:it.danger?'#9E1028':'var(--dropdown-text)', fontSize:11, fontWeight:500 }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span>{it.icon}</span>{it.label}
            </button>
          )}
        </div>
      </>)}
    </div>
  );
}

function ActionToast({ notice, onClose }) {
  if (!notice) return null;
  const isError = notice.type === 'error';
  const isLoading = notice.type === 'loading';
  const hasText = !!notice.copyText;
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(notice.copyText || '');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = notice.copyText || '';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };
  return (
    <div style={{ position:'fixed', top:96, left:'50%', transform:'translateX(-50%)', zIndex:180, width:hasText?760:620, maxWidth:'calc(100vw - 48px)', background:'#FFFCF7', border:`1px solid ${isError?'rgba(239,68,68,0.42)':'rgba(13,171,119,0.34)'}`, borderRadius:10, boxShadow:'0 18px 48px rgba(15,43,26,0.24)', padding:'18px 20px', color:'#1D1D1B', fontFamily:'var(--font-sans)' }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
        <div style={{ width:38, height:38, borderRadius:10, display:'grid', placeItems:'center', background:isError?'#FEE2E2':isLoading?'#E8F3D8':'#DCFCE7', color:isError?'#DC2626':'#0DAB77', fontSize:22, fontWeight:900, flexShrink:0 }}>
          {isError ? '!' : isLoading ? '…' : '✓'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:18, fontWeight:900, marginBottom:6 }}>{notice.title}</div>
          <div style={{ fontSize:14, color:'#666', lineHeight:1.45 }}>{notice.message}</div>
          {hasText && (
            <>
              <textarea readOnly value={notice.copyText} style={{ marginTop:12, width:'100%', height:260, resize:'vertical', border:'1px solid #D7D0C5', borderRadius:8, padding:12, fontSize:13, lineHeight:1.45, fontFamily:'var(--font-numeric), ui-monospace, SFMono-Regular, Menlo, monospace', color:'#1D1D1B', background:'#FFF9F0' }} />
              <button onClick={copyText} style={{ marginTop:10, border:'1px solid rgba(13,171,119,0.35)', background:'#0DAB77', color:'#fff', borderRadius:7, padding:'8px 12px', cursor:'pointer', fontSize:12, fontWeight:900, fontFamily:'var(--font-sans)' }}>
                Copiar resumo
              </button>
            </>
          )}
          {notice.url && (
            <a href={notice.url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', marginTop:12, fontSize:13, fontWeight:800, color:'#0DAB77', textDecoration:'none' }}>
              Abrir aba gerada ↗
            </a>
          )}
        </div>
        {!isLoading && (
          <button onClick={onClose} style={{ border:'none', background:'transparent', color:'#797979', cursor:'pointer', fontSize:24, lineHeight:1, padding:0 }}>×</button>
        )}
      </div>
    </div>
  );
}

function Toolbar({ state, dispatch, onHighlight, onSave, onExportAction, planogramAll=false, onTogglePlanogramAll }) {
  const canUndo=state.histIdx>0, canRedo=state.histIdx<state.history.length-1;
  const isMap=state.view==='map';
  return (
    <div style={{ height:48, background:'var(--shopper-navy)', display:'flex', alignItems:'center', paddingLeft:14, paddingRight:10, flexShrink:0, zIndex:20, gap:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginRight:5 }}>
        <img src="/shopper-static/uploads/shopper-icon.avif" alt="Shopper" width="28" height="28" style={{ borderRadius:5, objectFit:'contain', flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.02em' }}>Alakazam - Endereçamento</span>
      </div>
      <Sep/>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:5 }}>
        <span style={{ fontSize:9, color:'rgba(255,255,255,0.38)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em' }}>Loja</span>
        <span style={{ fontSize:12, fontWeight:700, color:state.selectedStore?'#fff':'rgba(255,255,255,0.28)' }}>{state.selectedStore?.nome||'—'}</span>
      </div>
      <div style={{ flex:1 }} />
      {isMap&&(<>
        <CategoryFilter subcatFilters={state.subcatFilters} onChange={(filters)=>dispatch({type:'SET_SUBCAT_FILTERS',filters})} />
        <Sep/>
        <SearchBar allocations={state.allocations} onHighlight={(id,locs)=>dispatch({type:'HIGHLIGHT_AND_NAVIGATE',productId:id,locs})} />
        <Sep/>
        <TBtn icon="↩" onClick={()=>dispatch({type:'UNDO'})} disabled={!canUndo} title="Desfazer (Ctrl+Z)"/>
        <TBtn icon="↪" onClick={()=>dispatch({type:'REDO'})}  disabled={!canRedo} title="Refazer (Ctrl+Y)"/>
        <Sep/>
        <GlobalEquipmentFilter state={state} dispatch={dispatch} />
        <TBtn
          icon={<ToolbarEyeIcon />}
          label="Planograma"
          active={planogramAll}
          onClick={onTogglePlanogramAll}
          title={planogramAll ? 'Voltar loja para visão operacional' : 'Ver loja inteira em planograma'}
        />
        <Sep/>
        <ActionsDropdown dispatch={dispatch} onExportAction={onExportAction}/>
        <Sep/>
        <button onClick={onSave} title="Salvar versão do endereçamento"
          style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:5, cursor:'pointer',
            border:'1px solid rgba(13,171,119,0.4)', background:'rgba(13,171,119,0.15)',
            color:'#3DD4A6', fontSize:11, fontWeight:700, fontFamily:'var(--font-sans)', flexShrink:0 }}>
          <span style={{ fontSize:13, lineHeight:1 }}>↑</span>
          <span>Salvar</span>
        </button>
        <Sep/>
        <TBtn icon="◈" label="Métricas" active={state.openPanel==='metrics'} onClick={()=>dispatch({type:'OPEN_PANEL',panel:state.openPanel==='metrics'?null:'metrics'})}/>
        <TBtn icon="⧗" label="Versões"  active={state.openPanel==='versions'} onClick={()=>dispatch({type:'OPEN_PANEL',panel:state.openPanel==='versions'?null:'versions'})}/>
        <TBtn icon="?"  label="Legenda"  active={state.openPanel==='legend'}   onClick={()=>dispatch({type:'OPEN_PANEL',panel:state.openPanel==='legend'?null:'legend'})}/>
        <Sep/>
        <TBtn icon="⚙" active={state.configOpen} onClick={()=>dispatch({type:'TOGGLE_CONFIG'})} title="Configuração"/>
      </>)}
      <TBtn icon="☰" label={isMap?'Prancheta':''} active={isMap&&state.pranchetaOpen} onClick={()=>dispatch({type:'TOGGLE_PRANCHETA'})} title="Prancheta"/>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
function App() {
  const defaultColWidth = Math.max(340, Math.min(600, Math.floor(window.innerWidth * 0.28)));
  const TWEAK_DEFAULTS = { dark:false, density:'balanced', colWidth:defaultColWidth };
  const [tweaks,setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [state,dispatch]  = useReducer(reducer, initState);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [visibleQueue, setVisibleQueue] = useState({ tab:'nao_alocados', total:0, filtered:0, productIds:[] });
  const [planogramAll, setPlanogramAll] = useState(false);
  const pendingFingerprint = useMemo(() => pendingStateFingerprint(state), [state.allocations, state.mapStructure]);
  const savedFingerprintRef = useRef(pendingFingerprint);

  useEffect(()=>{ document.documentElement.setAttribute('data-dse-theme',tweaks.dark?'dark':'light'); },[tweaks.dark]);
  useEffect(() => {
    if (window.sessionStorage.getItem('dse-open-map') === '1') {
      window.sessionStorage.removeItem('dse-open-map');
      dispatch({ type:'OPEN_MAP' });
    }
  }, []);
  useEffect(() => {
    if (!state.highlightProductId) return undefined;
    const timer = window.setTimeout(() => dispatch({ type:'CLEAR_HIGHLIGHT' }), 9000);
    return () => window.clearTimeout(timer);
  }, [state.highlightProductId]);

  useEffect(()=>{
    const h=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){ e.preventDefault(); dispatch({type:'UNDO'}); }
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){ e.preventDefault(); dispatch({type:'REDO'}); }
      if(e.key==='Escape'){
        if(state.pendingConfirm)         dispatch({type:'CLEAR_CONFIRM'});
        else if(state.swapSource)        dispatch({type:'CLEAR_SWAP_SOURCE'});
        else if(state.highlightProductId)dispatch({type:'CLEAR_HIGHLIGHT'});
        else if(state.configOpen)        dispatch({type:'CLOSE_PANEL'});
        else if(state.openPanel)         dispatch({type:'CLOSE_PANEL'});
        else if(state.selectedProduct)   dispatch({type:'SELECT_PRODUCT',productId:null});
      }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[state.pendingConfirm,state.swapSource,state.highlightProductId,state.configOpen,state.openPanel,state.selectedProduct]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (state.view !== 'map' || pendingFingerprint === savedFingerprintRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingFingerprint, state.view]);

  const handleAllocate  = useCallback((id,pid,slot)=>dispatch({type:'ALLOCATE',escaninhoId:id,productId:pid,slot}),[]);
  const handleAllocateMany = useCallback((items)=>dispatch({type:'ALLOCATE_MANY',items}),[]);
  const handleAllocateManyProgressive = useCallback(async (items, onProgress)=>{
    const batch = Array.isArray(items) ? items : [];
    const total = batch.length;
    const historyGroup = total > 1 ? `batch:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` : null;
    for (let index = 0; index < total; index += 1) {
      const item = batch[index];
      dispatch({ type:'ALLOCATE', escaninhoId:item.escaninhoId, productId:item.productId, slot:item.slot, historyGroup });
      if (onProgress) onProgress(index + 1, total);
      if (index < total - 1) await new Promise((resolve) => window.setTimeout(resolve, 28));
    }
  },[]);
  const handleCollect   = useCallback((id,p)=>dispatch({type:'COLLECT',escaninhoId:id,product:p}),[]);
  const handleCollectMany = useCallback((escaninhoIds)=>dispatch({type:'COLLECT_MANY',escaninhoIds}),[]);
  const handleStartSwap = useCallback(eqId=>dispatch({type:'SET_SWAP_SOURCE',equipId:eqId}),[]);
  const handleCompleteSwap = useCallback(eqId=>{
    if(!state.swapSource||state.swapSource===eqId) { dispatch({type:'CLEAR_SWAP_SOURCE'}); return; }
    dispatch({type:'SWAP_EQUIP_CONTENTS',equipA:state.swapSource,equipB:eqId});
  },[state.swapSource]);
  const handleExportAction = useCallback(async (kind) => {
    const configs = {
      'equipment-summary': {
        title:'Gerando resumo de equipamentos',
        successTitle:'Resumo de equipamentos gerado',
        loading:'Montando texto com os tipos de equipamento por rua…',
        run:()=>({
          success:true,
          summary_text:buildEquipmentSummaryText(state),
          total_equipment:(state.mapStructure || []).reduce((total, street) => total + ((street.equipment || []).length), 0),
        }),
      },
      kdabta: {
        title:'Gerando planilha KDABTA',
        successTitle:'kdabra enderecar gerada',
        loading:'Criando aba kdabra enderecar na planilha ativa…',
        run:()=>API.generateKdabraEnderecarSheetAsync(),
      },
      kdabra: {
        title:'Gerando planilha KDABRA',
        successTitle:'Planilha KDABRA gerada',
        loading:'Criando aba KDABTA reenderecar na planilha ativa…',
        run:()=>API.generateKdabraSheetAsync(),
      },
    };
    const config = configs[kind];
    if (!config) return;
    setActionNotice({ type:'loading', title:config.title, message:config.loading });
    try {
      const result = await config.run();
      if (!result || !result.success) {
        throw new Error((result && result.error) || 'Ação não retornou sucesso.');
      }
      if (result.summary_text) {
        setActionNotice({
          type:'success',
          title:config.successTitle,
          message:`Resumo textual pronto para copiar. ${result.total_equipment || 0} equipamento(s) analisado(s).`,
          copyText:result.summary_text,
        });
        return;
      }
      const sheetName = result.sheetName || result.output_sheet || 'aba gerada';
      const rowText = Number.isFinite(Number(result.total_rows)) ? ` ${Number(result.total_rows)} linha(s).` : '';
      const warningText = result.warning ? ` ${result.warning}` : '';
      setActionNotice({
        type:'success',
        title:config.successTitle,
        message:`Aba ${sheetName} criada/atualizada na planilha ativa.${rowText}${warningText}`,
        url:result.url || '',
      });
      window.setTimeout(() => {
        setActionNotice((current) => current && current.type === 'success' ? null : current);
      }, 9000);
    } catch (error) {
      setActionNotice({
        type:'error',
        title:'Ação não concluída',
        message:String(error).replace(/^Error:\s*/, ''),
      });
    }
  }, []);
  const handleRecolherRua = useCallback(streetId=>{
    dispatch({type:'SET_CONFIRM',dialog:{
      title:`Recolher todos os produtos de ${streetId}?`,
      message:`Move todos os produtos alocados em <strong>${streetId}</strong> de volta para a Prancheta (Recolhidos).`,
      confirmLabel:'Recolher rua',
      onConfirm:()=>dispatch({type:'RECOLHER_RUA',streetId}),
    }});
  },[]);

  const handleSaveVersion = useCallback(async (name, setProgress, setStatus) => {
    const equipmentTypeChanges = Object.entries(state.pendingEquipmentTypeChanges || {});
    const pendingTypeChangesForSave = { ...(state.pendingEquipmentTypeChanges || {}) };
    const moves = diffMoves(state.allocations, state.mapStructure, pendingTypeChangesForSave);
    if (equipmentTypeChanges.length > 0) {
      for (let index = 0; index < equipmentTypeChanges.length; index += 1) {
        const [equipId, newType] = equipmentTypeChanges[index];
        if (setStatus) setStatus(`Atualizando tipo de ${equipId} na planilha…`);
        setProgress(20 + Math.round(((index + 1) / equipmentTypeChanges.length) * 25));
        const typeResponse = await API.changeEquipmentTypeAsync(equipId, newType, false);
        if (!typeResponse || !typeResponse.success) {
          throw new Error((typeResponse && typeResponse.error) || `Não foi possível alterar o tipo de ${equipId}.`);
        }
      }
    }
    if (moves.length > 0) {
      if (setStatus) setStatus('Salvando movimentos pendentes…');
      setProgress(equipmentTypeChanges.length ? 58 : 45);
      const movesResponse = await API.saveBatchMovesAsync(moves, {});
      if (!movesResponse || !movesResponse.success) {
        throw new Error((movesResponse && movesResponse.error) || 'Não foi possível salvar os movimentos.');
      }
    }
    if (setStatus) setStatus('Criando aba da versão…');
    setProgress(80);
    const versionResponse = await API.saveVersionAsync(name);
    if (!versionResponse || !versionResponse.success) {
      throw new Error((versionResponse && versionResponse.error) || 'Não foi possível salvar a versão.');
    }
    if (equipmentTypeChanges.length > 0) dispatch({type:'CLEAR_PENDING_EQUIP_TYPE_CHANGES'});
    savedFingerprintRef.current = pendingFingerprint;
    setProgress(95);
    if (setStatus) setStatus('Finalizando…');
    return versionResponse;
  }, [state.allocations, state.pendingEquipmentTypeChanges, pendingFingerprint]);

  const yieldToBrowser = () => new Promise((resolve) => window.setTimeout(resolve, 0));

  const handleFillStreet = useCallback(async ({ streetId, equipmentIds, levelMode, onProgress }) => {
    const remainingEntries = prioritizeStreetFillEntries(capQueueByRemainingBins(visibleQueue.productIds || [], state.allocations));
    if (!remainingEntries.length) throw new Error('Nenhum produto elegível na lista atual.');

    const orderedEquipmentIds = Array.isArray(equipmentIds) ? equipmentIds.filter(Boolean) : [];
    if (!orderedEquipmentIds.length) throw new Error('Nenhum equipamento visível nesta rua.');
    const selectedEquipmentIds = orderedEquipmentIds;
    const plan = planStreetColdEquipmentTypes(state, { streetId, equipmentIds:selectedEquipmentIds, remainingEntries, levelMode });
    const plannedMapStructure = plan.mapStructure;
    const plannedTypePlan = plan.typePlan;
    const degeloPreferredEquipmentIds = plan.degeloPreferredEquipmentIds;
    const selectedEquipmentTargets = selectedEquipmentIds.map((candidateId) => {
      const targets = collectStreetFillTargets(state, {
        streetId,
        equipmentIds:[candidateId],
        levelMode,
        mapStructure:plannedMapStructure,
      });
      return { equipmentId:candidateId, targets };
    }).filter((item) => item.targets.length > 0);
    if (!selectedEquipmentTargets.length) throw new Error('Nenhum slot elegível nos equipamentos visíveis.');

    const targetGroups = [];
    let totalTargets = 0;
    selectedEquipmentTargets.forEach(({ equipmentId, targets:equipmentTargets }, index) => {
      totalTargets += equipmentTargets.length;
      if (typeof onProgress === 'function') {
        onProgress({ done:index + 1, total:selectedEquipmentTargets.length, equipmentId, applied:0, phase:'preparando' });
      }
      if (equipmentTargets.length) targetGroups.push({ equipmentId, targets:equipmentTargets });
    });
    if (!totalTargets) throw new Error('Nenhum slot elegível nos equipamentos visíveis.');

    const codeToEntryIds = {};
    const unallocatedCodes = remainingEntries.map((entryId) => {
      const code = resolveBoardEntryProductCode(entryId);
      if (!code) return '';
      if (!codeToEntryIds[code]) codeToEntryIds[code] = [];
      codeToEntryIds[code].push(entryId);
      return code;
    }).filter(Boolean);
    if (!unallocatedCodes.length) throw new Error('Nenhum produto elegível na lista atual.');

    if (typeof onProgress === 'function') {
      onProgress({ done:0, total:selectedEquipmentTargets.length, equipmentId:streetId, applied:0, phase:'calculando' });
    }
    await yieldToBrowser();

    const response = await fetch('/api/addressing/fill-street', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        unallocated_codes:unallocatedCodes,
        products_data:Object.values(PRODUCT_MAP),
        map_structure:plannedMapStructure,
        allocations:state.allocations,
        target_groups:targetGroups,
        options:{
          allow_top_level:true,
          allow_second_slot:false,
          whole_street:true,
          degelo_preferred_equipment_ids:degeloPreferredEquipmentIds,
        },
      }),
    });
    if (!response.ok) throw new Error(`Preenchimento da rua falhou com HTTP ${response.status}.`);
    const result = await response.json();
    if (!result || !result.success) throw new Error((result && result.error) || 'Preenchimento da rua não retornou sucesso.');

    const allTargetIds = new Set(targetGroups.flatMap((group) => group.targets || []));
    const moves = (result.moves || []).map((move) => {
      const queueForCode = codeToEntryIds[move.productCode] || [];
      const productId = queueForCode.shift() || move.productCode;
      return {
        escaninhoId:move.escaninhoId,
        productId,
        slot:move.slot || 1,
      };
    }).filter((item) => item.productId && allTargetIds.has(item.escaninhoId));

    const allMoves = moves;
    if (!allMoves.length) throw new Error('Nenhuma alocação possível para os filtros atuais.');

    const historyGroup = allMoves.length > 1 ? `fill-street:${streetId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` : null;
    if (plannedTypePlan && Object.keys(plannedTypePlan).length) {
      dispatch({ type:'APPLY_EQUIP_TYPE_PLAN', typePlan:plannedTypePlan });
      await yieldToBrowser();
    }
    const batchSize = 80;
    for (let index = 0; index < allMoves.length; index += batchSize) {
      const batch = allMoves.slice(index, index + batchSize);
      dispatch({ type:'ALLOCATE_BATCH', moves:batch, historyGroup });
      const applied = Math.min(allMoves.length, index + batch.length);
      if (typeof onProgress === 'function') {
        onProgress({
          done:applied,
          total:allMoves.length,
          equipmentId:String(batch[batch.length - 1]?.escaninhoId || '').split('-').slice(0, 2).join('-') || streetId,
          applied,
          phase:'aplicando',
        });
      }
      if (index + batchSize < allMoves.length) await yieldToBrowser();
    }
    if (typeof onProgress === 'function') {
      onProgress({ done:allMoves.length, total:allMoves.length, equipmentId:streetId, applied:allMoves.length, phase:'concluido' });
    }
    await yieldToBrowser();
    return { applied:allMoves.length, targets:totalTargets, products:capQueueByRemainingBins(visibleQueue.productIds || [], state.allocations).length, equipmentDone:selectedEquipmentTargets.length };
  }, [state, visibleQueue]);

  return (
    <div data-dse-theme={tweaks.dark?'dark':'light'} style={{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--app-bg)', fontFamily:'var(--font-sans)' }}>
      <Toolbar state={state} dispatch={dispatch} onSave={()=>setSaveModalOpen(true)} onExportAction={handleExportAction} planogramAll={planogramAll} onTogglePlanogramAll={()=>setPlanogramAll(v=>!v)} />
      <ActionToast notice={actionNotice} onClose={()=>setActionNotice(null)} />

      <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>
        {state.view==='config'&&(
          <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <DSEConfigPanel asOverlay={false} onOpenMap={()=>{
              window.sessionStorage.setItem('dse-open-map', '1');
              window.location.reload();
            }}
              selectedStore={state.selectedStore} onStoreChange={s=>dispatch({type:'SET_STORE',store:s})}/>
          </div>
        )}

        {state.view==='map'&&(<>
          <DSEMapCanvas
            mapStructure={state.mapStructure} allocations={state.allocations}
            equipCollapsed={state.equipCollapsed} streetCollapsed={state.streetCollapsed}
            onToggleEquip={id=>dispatch({type:'TOGGLE_EQUIP',id})}
            onToggleStreet={id=>dispatch({type:'TOGGLE_STREET',id})}
            onAllocate={handleAllocate} onAllocateMany={handleAllocateMany}
            onAllocateManyProgressive={handleAllocateManyProgressive}
            onCollect={handleCollect} onCollectMany={handleCollectMany}
            selectedProduct={state.selectedProduct} mode2aLeva={state.mode2aLeva}
            colWidth={tweaks.colWidth} searchQuery={state.searchQuery} dispatch={dispatch}
            swapSource={state.swapSource} onStartSwap={handleStartSwap} onCompleteSwap={handleCompleteSwap}
            onRecolherRua={handleRecolherRua} highlightProductId={state.highlightProductId}
            subcatFilters={state.subcatFilters} queueProductIds={visibleQueue.productIds || []}
            pendingEquipmentTypeChanges={state.pendingEquipmentTypeChanges}
            globalEquipmentFilter={state.globalEquipmentFilter}
            globalPlanogramMode={planogramAll}
            onFillStreet={handleFillStreet}
          />

          {state.pranchetaOpen&&(
            <DSEPrancheta collected={state.collected} unallocated={state.unallocated} allocations={state.allocations}
              selectedProduct={state.selectedProduct} onSelectProduct={id=>dispatch({type:'SELECT_PRODUCT',productId:id})}
              mode2aLeva={state.mode2aLeva} onToggle2aLeva={()=>dispatch({type:'TOGGLE_2A_LEVA'})} width={300}
              onRegroupPartialProducts={(productCodes)=>dispatch({type:'SET_CONFIRM',dialog:{
                title:'Recolher produtos dispersos',
                message:`Os endereços atuais de <strong>${productCodes.length} produto(s)</strong> serão removidos do mapa. Todas as unidades necessárias voltarão juntas para Não alocados.`,
                confirmLabel:'Reagrupar',
                onConfirm:()=>dispatch({type:'REGROUP_PARTIAL_PRODUCTS',productCodes}),
              }})}
              quickActionMessage={state.quickActionMessage}
              onVisibleProductsChange={setVisibleQueue}/>
          )}
        </>)}

        {state.view==='map'&&state.configOpen&&(
          <DSEConfigPanel asOverlay={true} onClose={()=>dispatch({type:'CLOSE_PANEL'})} onOpenMap={()=>{
            window.sessionStorage.setItem('dse-open-map', '1');
            window.location.reload();
          }}
            selectedStore={state.selectedStore} onStoreChange={s=>dispatch({type:'SET_STORE',store:s})}/>
        )}

        {state.openPanel==='metrics'  &&<DSEMetricsPanel  allocations={state.allocations} onClose={()=>dispatch({type:'CLOSE_PANEL'})}/>}
        {state.openPanel==='versions' &&<DSEVersionsPanel onClose={()=>dispatch({type:'CLOSE_PANEL'})} onRestore={()=>{
          window.sessionStorage.setItem('dse-open-map', '1');
          window.location.reload();
        }}/>}
        {state.openPanel==='legend'   &&<DSELegendPanel   onClose={()=>dispatch({type:'CLOSE_PANEL'})}/>}
      </div>

      <ConfirmModal dialog={state.pendingConfirm} onConfirm={()=>{ state.pendingConfirm?.onConfirm?.(); dispatch({type:'CLEAR_CONFIRM'}); }} onCancel={()=>dispatch({type:'CLEAR_CONFIRM'})}/>

      {saveModalOpen && (
        <SaveModal
          onClose={()=>setSaveModalOpen(false)}
          onSaved={()=>{ setSaveModalOpen(false); }}
          onSave={handleSaveVersion}
        />
      )}

      <TweaksPanel>
        <TweakSection label="Aparência"/>
        <TweakToggle label="Dark mode" value={tweaks.dark} onChange={v=>setTweak('dark',v)}/>
        <TweakSection label="Mapa"/>
        <TweakRadio label="Densidade" value={tweaks.density} options={['compact','balanced','comfortable']} onChange={v=>setTweak('density',v)}/>
        <TweakSlider label="Largura da coluna" value={tweaks.colWidth} min={280} max={700} step={10} unit="px" onChange={v=>setTweak('colWidth',v)}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
