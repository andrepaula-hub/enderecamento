// DSE Prancheta v2 — direita, tooltip, subcategoria, tipo físico
const { useState, useMemo, useRef, useEffect, useCallback } = React;
const { DSEProductTooltip } = window;
const { PRODUCTS, PRODUCT_MAP } = window.DSEData;
const BOOTSTRAP = window.DSEBootstrap || {};
const HELPERS = window.DSEHelpers || {};
const CURVA_COLOR = window.DSE_CURVA_COLOR;
const GROUP_STYLE = window.DSE_GROUP_STYLE;
const normalizeSearchText = HELPERS.normalizeSearchText || ((value) => String(value || '').toLowerCase());

const GRUPOS = ['FLV','Alimento','Bebidas','Perfumaria','Químico','Neutro'];
const CURVAS  = ['A','B','C','D','E'];

const TIPO_FISICO_OPTIONS = [
  { id:'alto',    label:'Alto',   flag:'alto'    },
  { id:'pesado',  label:'Pesado', flag:'pesado'  },
  { id:'pequeno', label:'Pequeno',flag:'pequeno' },
  { id:'fragil',  label:'Frágil', flag:'fragil'  },
];

const DEGELO_OPTIONS = [
  { id:'PODE', label:'Pode sofrer' },
  { id:'NÃO',  label:'Não pode sofrer' },
];

const EQUIP_METODO_LABELS = {
  prateleira:'Prateleira', prateleira_pamplona:'Pamplona', prateleira_lateral:'Lat.',
  geladeira:'Geladeira', geladeira_alta:'Gelad. Alta', geladeira_gerador:'Gelad. Ger.',
  freezer:'Freezer', 'freezer horizontal':'Freezer H.', quimico:'Químico',
};

function resolveBoardEntry(entryId) {
  var raw = HELPERS.normalizeText ? HELPERS.normalizeText(entryId) : String(entryId || '').trim();
  if (!raw) return { entryId:'', productCode:'', product:null };
  var item = (BOOTSTRAP.RAW_UNALLOCATED_MAP || {})[raw] || {};
  var productCode = HELPERS.parseBoardEntryCode
    ? HELPERS.parseBoardEntryCode(item.product_code || raw)
    : String(item.product_code || raw).trim();
  var product = PRODUCT_MAP[productCode] || null;
  return { entryId:raw, productCode:productCode, product:product, raw:item };
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding:'2px 8px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer',
      border:active ? `1px solid ${color||'var(--shopper-green)'}` : '1px solid var(--pran-border)',
      background:active ? (color?`${color}20`:'rgba(13,171,119,0.12)') : 'transparent',
      color:active ? (color||'var(--shopper-green)') : 'var(--pran-muted)',
      fontFamily:'var(--font-sans)', flexShrink:0, lineHeight:1.7,
    }}>
      {label}
    </button>
  );
}

// ── Product item ──────────────────────────────────────────────────────────────
function ProductItem({ product, isSelected, onClick, onHover, onHoverEnd }) {
  const gs = GROUP_STYLE[product.grupo] || GROUP_STYLE.Neutro;
  const cc = CURVA_COLOR[product.curva] || '#94A3B8';
  const flags = [];
  if (product.pesado) flags.push({ type:'pesado', color:'#92400E', title:'Pesado (>5kg)' });
  if (product.alto)   flags.push({ type:'alto',   color:'#F59E0B', title:'Alto (>30cm)' });
  if (product.pequeno)          flags.push({ type:'pequeno', color:'#0891B2', title:'Pequeno/compacto' });
  if (product.degelo === 'NÃO') flags.push({ type:'degelo',  color:'#38BDF8', title:'Degelo NÃO' });

  return (
    <div onClick={()=>onClick(product)}
      onMouseEnter={e=>onHover&&onHover(product,e)}
      onMouseLeave={()=>onHoverEnd&&onHoverEnd()}
      style={{
        padding:'7px 10px', cursor:'pointer', borderRadius:5, marginBottom:2,
        background:isSelected?'rgba(13,171,119,0.10)':'transparent',
        border:isSelected?'1px solid rgba(13,171,119,0.35)':'1px solid transparent',
        transition:'background 0.1s', display:'flex', alignItems:'center', gap:8,
      }}>
      {/* Curva badge */}
      <div style={{ width:26, height:26, borderRadius:5, background:`${cc}20`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:800, color:cc }}>{product.curva}</span>
      </div>
      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--pran-text)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', lineHeight:1.3 }}>
          {product.nome}
        </div>
        <div style={{ display:'flex', gap:4, marginTop:2, alignItems:'center' }}>
          <span style={{ fontSize:9, color:gs.text, fontWeight:700 }}>{gs.label}</span>
          <span style={{ fontSize:9, color:'var(--pran-muted)' }}>·</span>
          <span style={{ fontSize:9, color:'var(--pran-muted)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{product.sub}</span>
        </div>
      </div>
      {/* Flags */}
      <div style={{ display:'flex', gap:3, flexShrink:0 }}>
        {flags.slice(0,3).map((f,i)=>(<PranchetaFlag key={i} flag={f} />))}
      </div>
      <span style={{
        fontSize:11,
        color:'#0DAB77',
        fontFamily:'var(--font-numeric)',
        fontWeight:800,
        flexShrink:0,
        background:'rgba(13,171,119,0.12)',
        border:'1px solid rgba(13,171,119,0.28)',
        borderRadius:999,
        padding:'2px 7px',
        lineHeight:1.2,
      }}>×{product.displayEscsCount || product.escsNec}</span>
    </div>
  );
}


// ── PranchetaFlag ─────────────────────────────────────────────────────────────
function PranchetaFlag({ flag }) {
  const { type, color, title } = flag;
  if (type==='pesado') return (
    <span title={title} style={{ color, lineHeight:1, flexShrink:0, display:'inline-flex', alignItems:'center' }}>
      <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
        <circle cx="5.5" cy="2.1" r="2.0"/>
        <path d="M 2.1 4.0 L 0.6 11.5 Q 0.5 12.5 1.6 12.5 L 9.4 12.5 Q 10.5 12.5 10.4 11.5 L 8.9 4.0 Z"/>
      </svg>
    </span>
  );
  if (type==='alto') return (
    <span title={title} style={{ color, lineHeight:1, flexShrink:0, display:'inline-flex', alignItems:'center' }}>
      <svg width="14" height="9" viewBox="0 0 13 8" fill="none">
        <rect x="0.5" y="2" width="12" height="4" rx="0.8" fill="currentColor" opacity="0.2"/>
        <rect x="0.5" y="2" width="12" height="4" rx="0.8" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="2.5" y1="2" x2="2.5" y2="4" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="4.5" y1="2" x2="4.5" y2="5.5" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="6.5" y1="2" x2="6.5" y2="4" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="8.5" y1="2" x2="8.5" y2="5.5" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="10.5" y1="2" x2="10.5" y2="4" stroke="currentColor" strokeWidth="0.8"/>
      </svg>
    </span>
  );
  if (type==='pequeno') return (
    <span title={title} style={{ color, lineHeight:1, flexShrink:0, display:'inline-flex', alignItems:'center' }}>
      <svg width="12" height="8" viewBox="0 0 11 7" fill="none">
        <rect x="0.5" y="1.5" width="10" height="4" rx="0.8" fill="currentColor" opacity="0.2"/>
        <rect x="0.5" y="1.5" width="10" height="4" rx="0.8" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="2" y1="1.5" x2="2" y2="3.5" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="4" y1="1.5" x2="4" y2="4.5" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="6" y1="1.5" x2="6" y2="3.5" stroke="currentColor" strokeWidth="0.8"/>
        <line x1="8" y1="1.5" x2="8" y2="4.5" stroke="currentColor" strokeWidth="0.8"/>
      </svg>
    </span>
  );
  const syms = { degelo:'❄' };
  return <span title={title} style={{ fontSize:10, color, fontWeight:800, flexShrink:0 }}>{syms[type]||'?'}</span>;
}

// ── Quick-collect button ──────────────────────────────────────────────────────
function QuickBtn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'4px 8px', fontSize:10, fontWeight:600, borderRadius:4, cursor:'pointer',
      border:'1px solid var(--pran-border)', background:'transparent', color:'var(--pran-muted)',
      fontFamily:'var(--font-sans)', textAlign:'left', lineHeight:1.4, width:'100%',
    }}
    onMouseEnter={e=>{e.currentTarget.style.background='var(--pran-hover)';e.currentTarget.style.color='var(--pran-text)';}}
    onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--pran-muted)';}}>
      {label}
    </button>
  );
}

// ── Main Prancheta ────────────────────────────────────────────────────────────
function DSEPrancheta({ collected, unallocated, allocations, selectedProduct, onSelectProduct, mode2aLeva, onToggle2aLeva, width, onVisibleProductsChange, onRegroupPartialProducts, quickActionMessage }) {
  const [tab, setTab]           = useState('nao_alocados');
  const [search, setSearch]     = useState('');
  const [filterGrupos, setFG]   = useState([]);
  const [filterCurvas, setFC]   = useState([]);
  const [filterTipos, setFT]    = useState([]); // 'alto' | 'pesado' | 'pequeno' | 'fragil'
  const [filterDegelo, setFD]   = useState([]);
  const [filterMetodos, setFM]  = useState([]);
  const [subSearch, setSubSearch]= useState('');
  const [subOpen, setSubOpen]   = useState(false);
  const [filterSubs, setFSubs]  = useState([]);
  const [showFilters, setShowF] = useState(false);
  const [showQuick, setShowQ]   = useState(false);
  const [tooltip, setTooltip]   = useState(null); // { product, x, y }

  const activeList = tab === 'recolhidos' ? collected : unallocated;
  const activeEntries = useMemo(() => activeList.map(resolveBoardEntry), [activeList]);
  const displayedEntries = useMemo(() => {
    if (tab !== 'nao_alocados') return activeEntries;
    const grouped = new Map();
    activeEntries.forEach((entry) => {
      if (!entry || !entry.productCode || !entry.product) return;
      const existing = grouped.get(entry.productCode);
      if (existing) {
        existing.entryIds.push(entry.entryId);
      } else {
        grouped.set(entry.productCode, {
          entryId: entry.entryId,
          productCode: entry.productCode,
          product: entry.product,
          raw: entry.raw,
          entryIds: [entry.entryId],
        });
      }
    });
    return Array.from(grouped.values());
  }, [activeEntries, tab]);

  const partialProductCodes = useMemo(() => {
    const currentlyAllocated = new Set();
    Object.values(allocations || {}).forEach((allocation) => {
      if (allocation?.p1) currentlyAllocated.add(String(allocation.p1).trim().toUpperCase());
      if (allocation?.p2) currentlyAllocated.add(String(allocation.p2).trim().toUpperCase());
    });
    const codes = new Set();
    activeEntries.forEach((entry) => {
      const hasAddress = entry?.raw?.has_any_address === true || entry?.raw?.hasAnyAddress === '1';
      if (hasAddress && entry.productCode && currentlyAllocated.has(String(entry.productCode).trim().toUpperCase())) {
        codes.add(entry.productCode);
      }
    });
    return Array.from(codes);
  }, [activeEntries, allocations]);

  // Collect all subcategories from current list
  const allSubs = useMemo(() => {
    const s = new Set();
    displayedEntries.forEach(entry => { if (entry.product) s.add(entry.product.sub); });
    return [...s].sort();
  }, [displayedEntries]);

  const filteredSubs = useMemo(() =>
    subSearch ? allSubs.filter(s=>normalizeSearchText(s).includes(normalizeSearchText(subSearch))) : allSubs,
    [allSubs, subSearch]);

  const filtered = useMemo(() => {
    return displayedEntries.filter(entry => {
      const p = entry.product;
      if (!p) return false;
      if (search && !normalizeSearchText(p.nome).includes(normalizeSearchText(search)) && !normalizeSearchText(p.id).includes(normalizeSearchText(search))) return false;
      if (filterGrupos.length && !filterGrupos.includes(p.grupo)) return false;
      if (filterCurvas.length && !filterCurvas.includes(p.curva)) return false;
      if (filterTipos.length) {
        const match = filterTipos.every(t => {
          if (t==='alto')    return p.alto;
          if (t==='pesado')  return p.pesado;
          if (t==='pequeno') return p.pequeno;
          if (t==='fragil')  return p.fragil;
          return false;
        });
        if (!match) return false;
      }
      if (filterDegelo.length && !filterDegelo.includes(p.degelo)) return false;
      if (filterMetodos.length && !filterMetodos.includes(p.arm)) return false;
      if (filterSubs.length && !filterSubs.includes(p.sub)) return false;
      return true;
    }).map(entry => Object.assign({}, entry.product, {
      boardEntryId: entry.entryId,
      boardEntryIds: entry.entryIds || [entry.entryId],
      boardProductCode: entry.productCode,
      displayEscsCount: tab === 'nao_alocados' ? Number(entry.product.escsNec || (entry.entryIds || []).length || 1) : Number(entry.product.escsNec || 1),
      missingInstanceCount: (entry.entryIds || [entry.entryId]).length,
    }));
  }, [displayedEntries, search, filterGrupos, filterCurvas, filterTipos, filterDegelo, filterMetodos, filterSubs, tab]);

  const countPendingEscaninhos = useCallback((entries) => {
    return (entries || []).reduce((total, entry) => {
      if (Number.isFinite(entry?.missingInstanceCount)) return total + entry.missingInstanceCount;
      const ids = entry?.boardEntryIds || entry?.entryIds || [entry?.boardEntryId || entry?.entryId];
      return total + ids.filter(Boolean).length;
    }, 0);
  }, []);

  const filteredEscsCount = useMemo(() => countPendingEscaninhos(filtered), [countPendingEscaninhos, filtered]);
  const totalEscsCount = useMemo(() => countPendingEscaninhos(displayedEntries), [countPendingEscaninhos, displayedEntries]);

  const selectedBoardProduct = useMemo(() => {
    if (!selectedProduct) return null;
    return resolveBoardEntry(selectedProduct).product || PRODUCT_MAP[selectedProduct] || null;
  }, [selectedProduct]);

  useEffect(() => {
    if (onVisibleProductsChange) {
      onVisibleProductsChange({
        tab: tab,
        total: totalEscsCount,
        filtered: filteredEscsCount,
        productIds: filtered.flatMap(product => product.boardEntryIds || [product.boardEntryId || product.id]),
      });
    }
  }, [onVisibleProductsChange, tab, totalEscsCount, filteredEscsCount, filtered]);

  const toggleGrupo  = g => setFG(prev=>prev.includes(g)?prev.filter(x=>x!==g):[...prev,g]);
  const toggleCurva  = c => setFC(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c]);
  const toggleTipo   = t => setFT(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]);
  const toggleDegelo = d => setFD(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d]);
  const toggleMetodo = m => setFM(prev=>prev.includes(m)?prev.filter(x=>x!==m):[...prev,m]);
  const toggleSub    = s => setFSubs(prev=>prev.includes(s)?prev.filter(x=>x!==s):[...prev,s]);

  const allMetodos = useMemo(() => {
    const s = new Set();
    activeEntries.forEach(e => { if (e.product?.arm && e.product.arm !== 'N/A') s.add(e.product.arm); });
    const priority = {
      'Itens de prateleira': 0,
      'Prateleira': 0,
      'Geladeira': 1,
      'Freezer': 2,
    };
    return [...s].sort((a, b) => {
      const pa = Object.prototype.hasOwnProperty.call(priority, a) ? priority[a] : 99;
      const pb = Object.prototype.hasOwnProperty.call(priority, b) ? priority[b] : 99;
      if (pa !== pb) return pa - pb;
      return String(a).localeCompare(String(b), 'pt-BR');
    });
  }, [activeEntries]);

  const totalFilters = filterGrupos.length + filterCurvas.length + filterTipos.length + filterDegelo.length + filterMetodos.length + filterSubs.length;

  const handleHover = (product, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ product, x: rect.left - 270, y: rect.top });
  };

  return (
    <div style={{ width, flexShrink:0, display:'flex', flexDirection:'column', background:'var(--pran-bg)', borderLeft:'1px solid var(--pran-border)', overflow:'hidden', position:'relative' }}>

      {/* Header */}
      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--pran-border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--pran-text)' }}>Prancheta</span>
          <button onClick={onToggle2aLeva} style={{
            padding:'3px 8px', fontSize:9, fontWeight:700, borderRadius:12, cursor:'pointer', fontFamily:'var(--font-sans)',
            background:mode2aLeva?'rgba(13,171,119,0.14)':'transparent',
            border:mode2aLeva?'1px solid rgba(13,171,119,0.4)':'1px solid var(--pran-border)',
            color:mode2aLeva?'var(--shopper-green)':'var(--pran-muted)',
          }}>
            2ª Leva {mode2aLeva?'ON':'OFF'}
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:4 }}>
          {[['nao_alocados','Não alocados'],['recolhidos','Recolhidos']].map(([v,label])=>(
            <button key={v} onClick={()=>setTab(v)} style={{
              flex:1, padding:'5px 0', fontSize:10, fontWeight:700, borderRadius:5, cursor:'pointer', fontFamily:'var(--font-sans)',
              border:tab===v?'1px solid var(--shopper-green)':'1px solid var(--pran-border)',
              background:tab===v?'rgba(13,171,119,0.10)':'transparent',
              color:tab===v?'var(--shopper-green)':'var(--pran-muted)',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter toggle */}
      <div style={{ padding:'7px 10px', borderBottom:'1px solid var(--pran-border)', flexShrink:0, display:'flex', gap:5 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome ou código…"
          style={{ flex:1, padding:'5px 8px', fontSize:11, background:'var(--pran-input)', border:'1px solid var(--pran-border)', borderRadius:5, color:'var(--pran-text)', outline:'none', fontFamily:'var(--font-sans)' }} />
        <button onClick={()=>setShowF(v=>!v)} style={{
          padding:'4px 8px', fontSize:10, fontWeight:700, borderRadius:5, cursor:'pointer', fontFamily:'var(--font-sans)',
          border:totalFilters?'1px solid var(--shopper-green)':'1px solid var(--pran-border)',
          background:totalFilters?'rgba(13,171,119,0.10)':'transparent',
          color:totalFilters?'var(--shopper-green)':'var(--pran-muted)',
        }}>
          {showFilters?'▲':'▼'} {totalFilters>0?`(${totalFilters})`:'Filtros'}
        </button>
      </div>
      <div style={{ padding:'5px 10px 7px', borderBottom:showFilters?'1px solid var(--pran-border)':'none', flexShrink:0 }}>
        <div style={{ fontSize:10, color:'var(--pran-muted)', fontFamily:'var(--font-numeric)' }}>
          {tab === 'nao_alocados' ? 'Não alocados ' : 'Recolhidos '}
          <strong style={{ color:'var(--pran-text)', fontWeight:800 }}>{filteredEscsCount}</strong>
          {' '}de {totalEscsCount}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--pran-border)', flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>

          {/* Grupo */}
          <div>
            <div style={filterLabel}>Grupo</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
              {GRUPOS.map(g=><Chip key={g} label={g} active={filterGrupos.includes(g)} onClick={()=>toggleGrupo(g)} color={GROUP_STYLE[g]?.text} />)}
              {filterGrupos.length>0 && <Chip label="✕" active={false} onClick={()=>setFG([])} />}
            </div>
          </div>

          {/* Curva */}
          <div>
            <div style={filterLabel}>Curva</div>
            <div style={{ display:'flex', gap:3 }}>
              {CURVAS.map(c=><Chip key={c} label={c} active={filterCurvas.includes(c)} onClick={()=>toggleCurva(c)} color={CURVA_COLOR[c]} />)}
              {filterCurvas.length>0 && <Chip label="✕" active={false} onClick={()=>setFC([])} />}
            </div>
          </div>

          {/* Tipo físico */}
          <div>
            <div style={filterLabel}>Tipo físico</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
              {TIPO_FISICO_OPTIONS.map(t=>(
                <Chip key={t.id} label={t.label} active={filterTipos.includes(t.id)} onClick={()=>toggleTipo(t.id)} />
              ))}
              {filterTipos.length>0 && <Chip label="✕" active={false} onClick={()=>setFT([])} />}
            </div>
          </div>

          <div>
            <div style={filterLabel}>Degelo</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
              {DEGELO_OPTIONS.map(d=>(
                <Chip key={d.id} label={d.label} active={filterDegelo.includes(d.id)} onClick={()=>toggleDegelo(d.id)} />
              ))}
              {filterDegelo.length>0 && <Chip label="✕" active={false} onClick={()=>setFD([])} />}
            </div>
          </div>

          {/* Equipamento */}
          {allMetodos.length > 1 && (
            <div>
              <div style={filterLabel}>Equipamento</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                {allMetodos.map(m=>(
                  <Chip key={m} label={EQUIP_METODO_LABELS[m]||m} active={filterMetodos.includes(m)} onClick={()=>toggleMetodo(m)} />
                ))}
                {filterMetodos.length>0 && <Chip label="✕" active={false} onClick={()=>setFM([])} />}
              </div>
            </div>
          )}

          {/* Subcategoria */}
          <div>
            <div style={filterLabel}>Subcategoria</div>
            {filterSubs.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:5 }}>
                {filterSubs.map(s=>(
                  <div key={s} style={{ display:'flex', alignItems:'center', gap:2, padding:'2px 6px 2px 8px', background:'rgba(13,171,119,0.12)', border:'1px solid rgba(13,171,119,0.35)', borderRadius:10, fontSize:9, fontWeight:700, color:'var(--shopper-green)', fontFamily:'var(--font-sans)' }}>
                    {s}
                    <button onClick={()=>toggleSub(s)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(61,212,166,0.65)', fontSize:11, lineHeight:1, padding:'0 0 0 2px', display:'flex' }}>×</button>
                  </div>
                ))}
                <button onClick={()=>setFSubs([])} style={{ fontSize:9, color:'var(--pran-muted)', background:'none', border:'none', cursor:'pointer', padding:'2px 4px', fontFamily:'var(--font-sans)' }}>Limpar ✕</button>
              </div>
            )}
            <div style={{ position:'relative' }}>
              <input value={subSearch}
                onChange={e=>{ setSubSearch(e.target.value); setSubOpen(true); }}
                onFocus={()=>setSubOpen(true)}
                onBlur={()=>setTimeout(()=>setSubOpen(false),150)}
                placeholder={filterSubs.length>0 ? filterSubs.length+' selecionada(s) — buscar mais…' : 'Buscar subcategoria…'}
                style={{ width:'100%', padding:'4px 8px', fontSize:10, background:'var(--pran-input)', border:'1px solid var(--pran-border)', borderRadius:4, color:'var(--pran-text)', outline:'none', fontFamily:'var(--font-sans)', boxSizing:'border-box' }} />
              {subOpen && filteredSubs.filter(s=>!filterSubs.includes(s)).length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:5, boxShadow:'0 8px 24px rgba(0,0,0,0.25)', maxHeight:150, overflowY:'auto' }}>
                  {filteredSubs.filter(s=>!filterSubs.includes(s)).map(s=>(
                    <button key={s} onMouseDown={()=>{ toggleSub(s); setSubSearch(''); }}
                      style={{ display:'block', width:'100%', padding:'5px 10px', border:'none', cursor:'pointer', textAlign:'left', fontSize:10, fontFamily:'var(--font-sans)', background:'transparent', color:'var(--dropdown-text)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clear all */}
          {totalFilters>0 && (
            <button onClick={()=>{setFG([]);setFC([]);setFT([]);setFD([]);setFM([]);setFSubs([]);}} style={{ padding:'4px', fontSize:10, fontWeight:700, background:'transparent', border:'1px solid var(--pran-border)', borderRadius:4, cursor:'pointer', color:'var(--pran-muted)', fontFamily:'var(--font-sans)' }}>
              Limpar todos os filtros
            </button>
          )}
        </div>
      )}

      {/* Selected product banner */}
      {selectedProduct && (
        <div style={{ padding:'6px 12px', background:'rgba(13,171,119,0.10)', borderBottom:'1px solid rgba(13,171,119,0.22)', flexShrink:0 }}>
          <div style={{ fontSize:8, fontWeight:700, color:'var(--shopper-green)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>Alocando</div>
          <div style={{ fontSize:10, fontWeight:600, color:'var(--pran-text)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
            {selectedBoardProduct?.nome}
          </div>
          <div style={{ fontSize:9, color:'var(--pran-muted)', marginTop:1 }}>Clique em escaninho vazio · ESC cancela</div>
        </div>
      )}

      {/* Product list */}
      <div style={{ flex:1, overflowY:'auto', padding:'4px 6px' }}>
        {filtered.length===0 && (
          <div style={{ padding:'14px 8px', textAlign:'center', color:'var(--pran-muted)', fontSize:11, lineHeight:1.6 }}>
            {activeList.length===0
              ? (tab==='recolhidos' ? 'Nenhum produto recolhido.' : 'Todos os produtos estão alocados.')
              : 'Nenhum resultado para o filtro atual.'}
          </div>
        )}
        {filtered.map(product=>(
          <ProductItem key={product.boardEntryId || product.id} product={product}
            isSelected={selectedProduct===(product.boardEntryId || product.id)}
            onClick={p=>onSelectProduct((p.boardEntryId || p.id)===selectedProduct?null:(p.boardEntryId || p.id))}
            onHover={handleHover}
            onHoverEnd={()=>setTooltip(null)}
          />
        ))}
      </div>

      {/* Quick-collect */}
      <div style={{ borderTop:'1px solid var(--pran-border)', flexShrink:0 }}>
        <button onClick={()=>setShowQ(v=>!v)} style={{ width:'100%', padding:'7px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'transparent', border:'none', cursor:'pointer', color:'var(--pran-muted)', fontSize:10, fontWeight:700, fontFamily:'var(--font-sans)' }}>
          <span>Ações rápidas</span>
          <span>{showQuick?'▲':'▼'}</span>
        </button>
        {showQuick && (
          <div style={{ padding:'4px 8px 10px', display:'flex', flexDirection:'column', gap:3 }}>
            <QuickBtn
              label={`Recolher produtos dispersos (${partialProductCodes.length})`}
              onClick={()=>partialProductCodes.length && onRegroupPartialProducts?.(partialProductCodes)}
            />
            {quickActionMessage && (
              <div style={{ padding:'5px 7px', borderRadius:4, background:'rgba(13,171,119,0.10)', color:'var(--shopper-green)', fontSize:9, lineHeight:1.4 }}>
                {quickActionMessage}
              </div>
            )}
            <QuickBtn label="Recolher altos em geladeiras" onClick={()=>{}} />
            <QuickBtn label="Recolher 2º slot de prateleiras" onClick={()=>{}} />
            <QuickBtn label="Recolher 2º slot de geladeiras" onClick={()=>{}} />
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <DSEProductTooltip product={tooltip.product} product2={null}
          position={{ x:tooltip.x, y:tooltip.y }}
          onClose={()=>setTooltip(null)} onEdit={()=>{}} />
      )}
    </div>
  );
}

const filterLabel = { fontSize:9, fontWeight:700, color:'var(--pran-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 };

Object.assign(window, { DSEPrancheta });
