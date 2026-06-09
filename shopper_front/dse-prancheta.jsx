// DSE Prancheta v2 — direita, tooltip, subcategoria, tipo físico
const { useState, useMemo, useRef } = React;
const { DSEProductTooltip } = window;
const { PRODUCTS, PRODUCT_MAP } = window.DSEData;
const CURVA_COLOR = window.DSE_CURVA_COLOR;
const GROUP_STYLE = window.DSE_GROUP_STYLE;

const GRUPOS = ['FLV','Alimento','Bebidas','Perfumaria','Químico','Neutro'];
const CURVAS  = ['A','B','C','D','E'];

const TIPO_FISICO_OPTIONS = [
  { id:'alto',    label:'Alto',   flag:'alto'    },
  { id:'pesado',  label:'Pesado', flag:'pesado'  },
  { id:'pequeno', label:'Pequeno',flag:'pequeno' },
  { id:'fragil',  label:'Frágil', flag:'fragil'  },
];

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
  if (product.quimico) flags.push({ sym:'⚠', color:'#EF4444', title:'Químico' });
  else {
    if (product.pesado) flags.push({ sym:'⬤', color:'#92400E', title:'Pesado' });
    if (product.alto)   flags.push({ sym:'↑', color:'#F59E0B', title:'Alto' });
  }
  if (product.pequeno)          flags.push({ sym:'↓', color:'#0891B2', title:'Pequeno' });
  if (product.degelo === 'NÃO') flags.push({ sym:'❄', color:'#38BDF8', title:'Degelo NÃO' });

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
        {flags.slice(0,3).map((f,i)=>(
          <span key={i} title={f.title} style={{ fontSize:10, color:f.color, fontWeight:800 }}>{f.sym}</span>
        ))}
      </div>
      <span style={{ fontSize:9, color:'var(--pran-muted)', fontFamily:'var(--font-numeric)', flexShrink:0 }}>×{product.escsNec}</span>
    </div>
  );
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
function DSEPrancheta({ collected, unallocated, selectedProduct, onSelectProduct, mode2aLeva, onToggle2aLeva, width }) {
  const [tab, setTab]           = useState('nao_alocados');
  const [search, setSearch]     = useState('');
  const [filterGrupos, setFG]   = useState([]);
  const [filterCurvas, setFC]   = useState([]);
  const [filterTipos, setFT]    = useState([]); // 'alto' | 'pesado' | 'pequeno' | 'fragil'
  const [subSearch, setSubSearch]= useState('');
  const [filterSubs, setFSubs]  = useState([]);
  const [showFilters, setShowF] = useState(false);
  const [showQuick, setShowQ]   = useState(false);
  const [tooltip, setTooltip]   = useState(null); // { product, x, y }

  const activeList = tab === 'recolhidos' ? collected : unallocated;

  // Collect all subcategories from current list
  const allSubs = useMemo(() => {
    const s = new Set();
    activeList.forEach(pid => { const p=PRODUCT_MAP[pid]; if(p) s.add(p.sub); });
    return [...s].sort();
  }, [activeList]);

  const filteredSubs = useMemo(() =>
    subSearch ? allSubs.filter(s=>s.toLowerCase().includes(subSearch.toLowerCase())) : allSubs,
    [allSubs, subSearch]);

  const filtered = useMemo(() => {
    return activeList.filter(pid => {
      const p = PRODUCT_MAP[pid];
      if (!p) return false;
      if (search && !p.nome.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
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
      if (filterSubs.length && !filterSubs.includes(p.sub)) return false;
      return true;
    }).map(pid=>PRODUCT_MAP[pid]).filter(Boolean);
  }, [activeList, search, filterGrupos, filterCurvas, filterTipos, filterSubs]);

  const toggleGrupo = g => setFG(prev=>prev.includes(g)?prev.filter(x=>x!==g):[...prev,g]);
  const toggleCurva = c => setFC(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c]);
  const toggleTipo  = t => setFT(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]);
  const toggleSub   = s => setFSubs(prev=>prev.includes(s)?prev.filter(x=>x!==s):[...prev,s]);

  const totalFilters = filterGrupos.length + filterCurvas.length + filterTipos.length + filterSubs.length;

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
          {[['nao_alocados','Não alocados',unallocated.length],['recolhidos','Recolhidos',collected.length]].map(([v,label,count])=>(
            <button key={v} onClick={()=>setTab(v)} style={{
              flex:1, padding:'5px 0', fontSize:10, fontWeight:700, borderRadius:5, cursor:'pointer', fontFamily:'var(--font-sans)',
              border:tab===v?'1px solid var(--shopper-green)':'1px solid var(--pran-border)',
              background:tab===v?'rgba(13,171,119,0.10)':'transparent',
              color:tab===v?'var(--shopper-green)':'var(--pran-muted)',
            }}>
              {label} <span style={{ opacity:0.65 }}>({count})</span>
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

          {/* Subcategoria */}
          <div>
            <div style={filterLabel}>Subcategoria</div>
            <input value={subSearch} onChange={e=>setSubSearch(e.target.value)} placeholder="Buscar subcategoria…"
              style={{ width:'100%', padding:'4px 8px', fontSize:10, background:'var(--pran-input)', border:'1px solid var(--pran-border)', borderRadius:4, color:'var(--pran-text)', outline:'none', marginBottom:5, fontFamily:'var(--font-sans)' }} />
            <div style={{ display:'flex', flexWrap:'wrap', gap:3, maxHeight:72, overflowY:'auto' }}>
              {filteredSubs.map(s=>(
                <Chip key={s} label={s} active={filterSubs.includes(s)} onClick={()=>toggleSub(s)} />
              ))}
              {filterSubs.length>0 && <Chip label="✕ Limpar" active={false} onClick={()=>setFSubs([])} />}
            </div>
          </div>

          {/* Clear all */}
          {totalFilters>0 && (
            <button onClick={()=>{setFG([]);setFC([]);setFT([]);setFSubs([]);}} style={{ padding:'4px', fontSize:10, fontWeight:700, background:'transparent', border:'1px solid var(--pran-border)', borderRadius:4, cursor:'pointer', color:'var(--pran-muted)', fontFamily:'var(--font-sans)' }}>
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
            {PRODUCT_MAP[selectedProduct]?.nome}
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
          <ProductItem key={product.id} product={product}
            isSelected={selectedProduct===product.id}
            onClick={p=>onSelectProduct(p.id===selectedProduct?null:p.id)}
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
            <QuickBtn label="Recolher todos com falta de escaninho" onClick={()=>{}} />
            <QuickBtn label="Recolher produtos dispersos" onClick={()=>{}} />
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
