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
        Object.entries(allocations).forEach(([k,a])=>{ if(a.p1===p.id||a.p2===p.id) locs.push(k); });
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
            const cc = CURVA_COLOR[r.product.curva]||'#94A3B8';
            const gs = GROUP_STYLE[r.product.grupo]||GROUP_STYLE.Neutro;
            return (
              <button key={r.product.id} onClick={()=>handleSelect(r)}
                style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 12px', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:'transparent' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:24, height:24, borderRadius:5, background:`${cc}20`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:cc }}>{r.product.curva}</span>
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
const initState = {
  view:'config', configOpen:false, selectedStore:null,
  allocations:{ ...INITIAL_ALLOCATIONS },
  history:[{ ...INITIAL_ALLOCATIONS }], histIdx:0,
  selectedProduct:null, mode2aLeva:false, pranchetaOpen:true, openPanel:null,
  collected:[], unallocated:[...INITIAL_UNALLOCATED], searchQuery:'',
  mapStructure:initMapStructure, equipCollapsed:{}, streetCollapsed:{},
  pendingConfirm:null,
  swapSource:null,
  highlightProductId:null,
  subcatFilters:[],
};

function commitAllocs(state, newAllocs) {
  const h=[...state.history.slice(0,state.histIdx+1),{...newAllocs}];
  return {...state, allocations:newAllocs, history:h, histIdx:h.length-1};
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

function diffMoves(currentAllocations) {
  const original = BOOTSTRAP.INITIAL_PLACEMENTS || {};
  const current = collectPlacements(currentAllocations);
  const slotMeta = BOOTSTRAP.SLOT_META || {};
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
      const src = slotMeta[remainingOriginal[i]];
      const dst = slotMeta[remainingCurrent[i]];
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
      const src = slotMeta[remainingOriginal[i]];
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
      const dst = slotMeta[remainingCurrent[i]];
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

function reducer(state, action) {
  switch(action.type) {
    case 'OPEN_MAP':        return {...state, view:'map', configOpen:false};
    case 'TOGGLE_CONFIG':   return {...state, configOpen:!state.configOpen};
    case 'SET_STORE':       return {...state, selectedStore:action.store};
    case 'OPEN_PANEL':      return {...state, openPanel:action.panel};
    case 'CLOSE_PANEL':     return {...state, openPanel:null, configOpen:false};
    case 'TOGGLE_PRANCHETA':return {...state, pranchetaOpen:!state.pranchetaOpen};
    case 'SELECT_PRODUCT':  return {...state, selectedProduct:action.productId};
    case 'TOGGLE_2A_LEVA':  return {...state, mode2aLeva:!state.mode2aLeva};
    case 'SET_SEARCH':      return {...state, searchQuery:action.query};
    case 'SET_SUBCAT_FILTERS': return {...state, subcatFilters:action.filters};
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
      const {escaninhoId,productId,slot}=action;
      const productCode = resolveBoardEntryProductCode(productId);
      if (!productCode) return state;
      const prev=state.allocations[escaninhoId]||{p1:null,p2:null};
      const na=slot===2?{p1:prev.p1,p2:productCode}:{p1:productCode,p2:prev.p2};
      const newA={...state.allocations,[escaninhoId]:na};
      return {
        ...commitAllocs(state,newA),
        collected:state.collected.filter(id=>id!==productId),
        unallocated:state.unallocated.filter(id=>id!==productId),
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
      return {
        ...commitAllocs(state,newA),
        collected:[collectedEntryId, ...state.collected],
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
      return {
        ...commitAllocs(state,newA),
        collected:state.collected.filter(id=>!collectedToRemove.has(id)),
        unallocated:state.unallocated.filter(id=>!unallocatedToRemove.has(id)),
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
        ...commitAllocs(state,newA),
        collected:newCollected,
        selectedProduct:null,
      };
    }
    case 'UNDO': {
      if(state.histIdx<=0) return state;
      const ni=state.histIdx-1;
      return {...state, histIdx:ni, allocations:{...state.history[ni]}};
    }
    case 'REDO': {
      if(state.histIdx>=state.history.length-1) return state;
      const ni=state.histIdx+1;
      return {...state, histIdx:ni, allocations:{...state.history[ni]}};
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
      return {...commitAllocs(state,newA), swapSource:null};
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
      return {...commitAllocs(state,newA), collected:newCollected,
        streetCollapsed:{...state.streetCollapsed, [action.streetId]:false}};
    }

    // ── Map structure mutations ──────────────────────────────────────────────
    case 'CHANGE_EQUIP_TYPE': {
      const ms=state.mapStructure.map(st=>({...st,equipment:st.equipment.map(eq=>eq.id===action.equipId?{...eq,tipo:action.tipo}:eq)}));
      return {...state,mapStructure:ms};
    }
    case 'REMOVE_EQUIP': {
      const ms=state.mapStructure.map(st=>({...st,equipment:st.equipment.filter(eq=>eq.id!==action.equipId)}));
      const na={...state.allocations};
      Object.keys(na).filter(k=>k.startsWith(action.equipId+'-')).forEach(k=>delete na[k]);
      return {...state,mapStructure:ms,allocations:na};
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
      const mx=Math.max(0,...state.mapStructure.map(st=>parseInt(st.id.replace('R',''))));
      return {...state,mapStructure:[...state.mapStructure,{id:`R${mx+1}`,nome:`Rua ${mx+1}`,equipment:[]}]};
    }
    case 'REMOVE_STREET': {
      const removed=state.mapStructure.find(st=>st.id===action.streetId);
      const ms=state.mapStructure.filter(st=>st.id!==action.streetId);
      const na={...state.allocations};
      (removed?.equipment||[]).forEach(eq=>Object.keys(na).filter(k=>k.startsWith(eq.id+'-')).forEach(k=>delete na[k]));
      return {...state,mapStructure:ms,allocations:na};
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

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={phase==='input'?onClose:undefined} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', background:'var(--cfg-surface)', border:'1px solid var(--cfg-border)', borderRadius:12, padding:'28px', width:420, boxShadow:'0 24px 60px rgba(0,0,0,0.4)' }}>
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
              <div style={{ fontSize:11, color:'var(--cfg-text-muted)', marginTop:5 }}>{name}</div>
            </div>
            {(saveResult?.sheet_url || saveResult?.plano_sheet_url) && (
              <div style={{ marginTop:16, background:'rgba(13,171,119,0.08)', border:'1px solid rgba(13,171,119,0.22)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Links rápidos</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {saveResult?.sheet_url && (
                    <a href={saveResult.sheet_url} target="_blank" rel="noreferrer" style={{ fontSize:11, fontWeight:700, color:'var(--shopper-green)', textDecoration:'none' }}>
                      Abrir aba da versão criada
                    </a>
                  )}
                  {saveResult?.plano_sheet_url && (
                    <a href={saveResult.plano_sheet_url} target="_blank" rel="noreferrer" style={{ fontSize:11, fontWeight:700, color:'var(--shopper-green)', textDecoration:'none' }}>
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

function Sep() { return <div style={{ width:1, height:20, background:'rgba(255,255,255,0.13)', margin:'0 3px', flexShrink:0 }} />; }

function ActionsDropdown({ dispatch }) {
  const [open,setOpen]=useState(false);
  const items=[
    {label:'Expandir todos',icon:'⊞',action:()=>dispatch({type:'EXPAND_ALL'})},
    {label:'Recolher todos',icon:'⊟',action:()=>dispatch({type:'COLLAPSE_ALL'})},
    {sep:true},
    {label:'Baixar XLSX atual',icon:'⬇',action:()=>API.download()},
    {sep:true},
    {label:'Gerar resumo de equipamentos',icon:'≡',action:()=>{ const res = API.generateLayoutAtual(); alert(res.success ? 'Layout atual gerado.' : res.error); }},
    {label:'Gerar planilha KDABTA',icon:'⊞',action:()=>{ const res = API.generateKdabraEnderecarSheet(); alert(res.success ? 'Planilha KDABTA gerada.' : res.error); }},
    {label:'Gerar planilha KDABRA',icon:'⊞',action:()=>{ const res = API.generateKdabraSheet(); alert(res.success ? 'Planilha KDABRA gerada.' : res.error); }},
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

function Toolbar({ state, dispatch, onHighlight, onSave }) {
  const canUndo=state.histIdx>0, canRedo=state.histIdx<state.history.length-1;
  const isMap=state.view==='map';
  return (
    <div style={{ height:48, background:'var(--shopper-navy)', display:'flex', alignItems:'center', paddingLeft:14, paddingRight:10, flexShrink:0, zIndex:20, gap:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginRight:5 }}>
        <img src="/shopper-static/uploads/shopper-icon.avif" alt="Shopper" width="28" height="28" style={{ borderRadius:5, objectFit:'contain', flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.02em' }}>Endereçamento</span>
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
        <ActionsDropdown dispatch={dispatch}/>
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
  const [visibleQueue, setVisibleQueue] = useState({ tab:'nao_alocados', total:0, filtered:0, productIds:[] });

  useEffect(()=>{ document.documentElement.setAttribute('data-dse-theme',tweaks.dark?'dark':'light'); },[tweaks.dark]);
  useEffect(() => {
    if (window.sessionStorage.getItem('dse-open-map') === '1') {
      window.sessionStorage.removeItem('dse-open-map');
      dispatch({ type:'OPEN_MAP' });
    }
  }, []);
  useEffect(() => {
    if (!state.highlightProductId) return undefined;
    const timer = window.setTimeout(() => dispatch({ type:'CLEAR_HIGHLIGHT' }), 4000);
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

  const handleAllocate  = useCallback((id,pid,slot)=>dispatch({type:'ALLOCATE',escaninhoId:id,productId:pid,slot}),[]);
  const handleAllocateMany = useCallback((items)=>dispatch({type:'ALLOCATE_MANY',items}),[]);
  const handleAllocateManyProgressive = useCallback(async (items, onProgress)=>{
    const batch = Array.isArray(items) ? items : [];
    const total = batch.length;
    for (let index = 0; index < total; index += 1) {
      const item = batch[index];
      dispatch({ type:'ALLOCATE', escaninhoId:item.escaninhoId, productId:item.productId, slot:item.slot });
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
  const handleRecolherRua = useCallback(streetId=>{
    dispatch({type:'SET_CONFIRM',dialog:{
      title:`Recolher todos os produtos de ${streetId}?`,
      message:`Move todos os produtos alocados em <strong>${streetId}</strong> de volta para a Prancheta (Recolhidos).`,
      confirmLabel:'Recolher rua',
      onConfirm:()=>dispatch({type:'RECOLHER_RUA',streetId}),
    }});
  },[]);

  const handleSaveVersion = useCallback(async (name, setProgress, setStatus) => {
    const moves = diffMoves(state.allocations);
    if (moves.length > 0) {
      if (setStatus) setStatus('Salvando movimentos pendentes…');
      setProgress(45);
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
    setProgress(95);
    if (setStatus) setStatus('Finalizando…');
    return versionResponse;
  }, [state.allocations]);

  return (
    <div data-dse-theme={tweaks.dark?'dark':'light'} style={{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--app-bg)', fontFamily:'var(--font-sans)' }}>
      <Toolbar state={state} dispatch={dispatch} onSave={()=>setSaveModalOpen(true)} />

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
            subcatFilters={state.subcatFilters} queueProductIds={visibleQueue.tab==='nao_alocados' ? visibleQueue.productIds : []}
          />

          {state.pranchetaOpen&&(
            <DSEPrancheta collected={state.collected} unallocated={state.unallocated}
              selectedProduct={state.selectedProduct} onSelectProduct={id=>dispatch({type:'SELECT_PRODUCT',productId:id})}
              mode2aLeva={state.mode2aLeva} onToggle2aLeva={()=>dispatch({type:'TOGGLE_2A_LEVA'})} width={300}
              onVisibleProductsChange={setVisibleQueue}/>
          )}
        </>)}

        {state.view==='map'&&state.configOpen&&(
          <DSEConfigPanel asOverlay={true} onClose={()=>dispatch({type:'CLOSE_PANEL'})} onOpenMap={()=>{}}
            selectedStore={state.selectedStore} onStoreChange={s=>dispatch({type:'SET_STORE',store:s})}/>
        )}

        {state.openPanel==='metrics'  &&<DSEMetricsPanel  allocations={state.allocations} onClose={()=>dispatch({type:'CLOSE_PANEL'})}/>}
        {state.openPanel==='versions' &&<DSEVersionsPanel onClose={()=>dispatch({type:'CLOSE_PANEL'})} onRestore={()=>window.location.reload()}/>}
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
