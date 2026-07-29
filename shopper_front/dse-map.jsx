// DSE Map v3 — Shopper palette, swap contents, recolher rua, highlight + scroll
const { useState, useCallback, useMemo, useRef, useEffect, memo } = React;
const { DSEEscaninho, DSEProductTooltip, DSE_getFlags, DSEFlagBadge } = window;
const { PRODUCT_MAP, SLOT_META } = window.DSEData;
const CURVA_COLOR = window.DSE_CURVA_COLOR;
const GROUP_STYLE = window.DSE_GROUP_STYLE;
const DSEHelpers = window.DSEHelpers || {};
const normalizeSearchText = DSEHelpers.normalizeSearchText || ((value) => String(value || '').toLowerCase());
const verticalLaneKey = DSEHelpers.verticalLaneKey || ((equipId, pos) => `${equipId}|${pos}`);
const readVerticalLaneLocks = DSEHelpers.readVerticalLaneLocks || (() => []);
const writeVerticalLaneLocks = DSEHelpers.writeVerticalLaneLocks || (() => {});
const isVerticalLaneLockedHelper = DSEHelpers.isVerticalLaneLocked || ((equipId, pos, locks) => (locks || []).includes(verticalLaneKey(equipId, pos)));

function parseBoardEntryCode(entryId) {
  if (typeof DSEHelpers.parseBoardEntryCode === 'function') {
    return DSEHelpers.parseBoardEntryCode(entryId);
  }
  const raw = String(entryId || '').trim();
  const match = raw.match(/^(?:unallocated|collected)::(.+?)::\d+$/);
  return match ? match[1] : raw;
}

function cssEscapeValue(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value || ''));
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function slotShortLabel(escaninhoId) {
  const parts = String(escaninhoId || '').split('-');
  const pos = parseInt(parts.pop() || '', 10);
  const level = parseInt(parts.pop() || '', 10);
  if (!Number.isFinite(level) || !Number.isFinite(pos) || level <= 0 || pos <= 0) return '';
  return `${level}${String.fromCharCode(64 + pos)}`;
}

function requiredBinsForProductCode(productCode) {
  const product = PRODUCT_MAP[productCode];
  const raw = product && (product.escsNec || product.escaninhos_necessarios);
  const parsed = parseInt(String(raw == null ? '' : raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// ── Equipment type config — Shopper brand palette ────────────────────────────
// Colors pulled from Shopper sub-brands: Programada #225CB3, Única #F59C00, Now #9E1028, Pet #F2749E
const EQUIP_CFG = {
  prateleira:           { label:'Prateleira',   short:'PRT', color:'#5A6A7E', borderColor:'#8394A8', headerBgL:'#F4F5F8', headerBgD:'#161D28' },
  prateleira_pamplona:  { label:'Prat. Pamplona', short:'PMP', color:'#5A6A7E', borderColor:'#8394A8', headerBgL:'#F4F5F8', headerBgD:'#161D28' },
  geladeira:            { label:'Geladeira',    short:'GLD', color:'#0A7A94', borderColor:'#12A3C0', headerBgL:'#E8F8FB', headerBgD:'#031820' },
  geladeira_alta:       { label:'Gel. Alta',    short:'GDA', color:'#1A4899', borderColor:'#225CB3', headerBgL:'#E6EDF9', headerBgD:'#080F22' },
  geladeira_gerador:    { label:'Gel. Degelo',  short:'GDG', color:'#B87200', borderColor:'#F59C00', headerBgL:'#FEF8E8', headerBgD:'#1C1200' },
  freezer:              { label:'Freezer',      short:'FRZ', color:'#1549C2', borderColor:'#2563EB', headerBgL:'#E0EAFF', headerBgD:'#070E28' },
  quimico:              { label:'Zona Química', short:'QMC', color:'#DC2626', borderColor:'#EF4444', headerBgL:'#FFF2F2', headerBgD:'#1A0000' },
  perfumaria:           { label:'Perfumaria',   short:'PRF', color:'#A8155A', borderColor:'#F2749E', headerBgL:'#FBE9F3', headerBgD:'#1A0512' },
};

const ALL_TYPES = Object.entries(EQUIP_CFG).map(([id,cfg])=>({id,...cfg}));

function formatEquipTypeLabel(type) {
  const text = String(type || '').replace(/[_-]+/g, ' ').trim();
  if (!text) return 'Prateleira';
  return text.replace(/\b\w/g, ch => ch.toUpperCase());
}

function getEquipCfg(type) {
  if (EQUIP_CFG[type]) return EQUIP_CFG[type];
  const normalized = String(type || '').toLowerCase();
  const base = normalized.includes('geladeira')
    ? EQUIP_CFG.geladeira
    : (normalized.includes('freezer') ? EQUIP_CFG.freezer : EQUIP_CFG.prateleira);
  return { ...base, label: formatEquipTypeLabel(type) };
}

function normalizeEquipmentFilterList(filter) {
  if (Array.isArray(filter)) return [...new Set(filter.filter((item)=>item && item !== 'all'))];
  if (!filter || filter === 'all') return [];
  return [filter];
}

function equipmentMatchesGlobalFilter(eq, filter) {
  const filters = normalizeEquipmentFilterList(filter);
  if (!filters.length) return true;
  const tipo = String(eq?.tipo || '').toLowerCase();
  const tipoAnterior = String(eq?.tipoAnterior || '').toLowerCase();
  const matches = (value, filterId) => {
    if (filterId === 'prateleira') return value.includes('prateleira') || value.includes('pamplona') || value.includes('lateral');
    if (filterId === 'geladeira') return value.includes('geladeira') || value.includes('refriger');
    if (filterId === 'freezer') return value.includes('freezer');
    return value === filterId;
  };
  return filters.some((filterId)=>matches(tipo, filterId) || matches(tipoAnterior, filterId));
}

function parseEscId(escaninhoId) {
  const parts = String(escaninhoId || '').split('-');
  const pos = parseInt(parts.pop() || '', 10);
  const level = parseInt(parts.pop() || '', 10);
  return {
    escaninhoId: String(escaninhoId || ''),
    equipId: parts.join('-'),
    level: Number.isFinite(level) ? level : 0,
    pos: Number.isFinite(pos) ? pos : 0,
  };
}

// ── Dominant curva ────────────────────────────────────────────────────────────
function getDominantCurva(eq, allocations) {
  const counts = {};
  for (let n=1; n<=eq.niveis; n++)
    for (let s=1; s<=eq.escsPerNivel; s++) {
      const p = PRODUCT_MAP[allocations[`${eq.id}-${n}-${s}`]?.p1];
      if (p?.curva) counts[p.curva] = (counts[p.curva]||0) + 1;
    }
  const e = Object.entries(counts);
  return e.length ? e.sort((a,b)=>b[1]-a[1])[0][0] : null;
}

function getDominantGroup(eq, allocations) {
  const counts = {};
  let total = 0;
  for (let n=1; n<=eq.niveis; n++) {
    for (let s=1; s<=eq.escsPerNivel; s++) {
      const alloc = allocations[`${eq.id}-${n}-${s}`] || {};
      ['p1', 'p2'].forEach((slot) => {
        const product = PRODUCT_MAP[alloc[slot]];
        const group = product && product.grupo;
        if (!group) return;
        counts[group] = (counts[group] || 0) + 1;
        total += 1;
      });
    }
  }
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) return null;
  return { group:entries[0][0], count:entries[0][1], total };
}

function getDegeloStats(eq, allocations) {
  let count = 0;
  let total = 0;
  for (let n=1; n<=eq.niveis; n++) {
    for (let s=1; s<=eq.escsPerNivel; s++) {
      const alloc = allocations[`${eq.id}-${n}-${s}`] || {};
      ['p1', 'p2'].forEach((slot) => {
        const product = PRODUCT_MAP[alloc[slot]];
        if (!product) return;
        const degelo = String(product.degelo || '').trim().toUpperCase();
        total += 1;
        if (degelo === 'NÃO' || degelo === 'NAO') count += 1;
      });
    }
  }
  return { count, total, majority: total > 0 && count / total >= 0.5 };
}

function isColdEquipment(eq) {
  const tipo = String(eq?.tipo || '').toLowerCase();
  return tipo.includes('geladeira') || tipo.includes('freezer') || tipo.includes('refriger');
}

function isPowerColdEquipment(eq, allocations) {
  const tipo = String(eq?.tipo || '').toLowerCase();
  if (tipo.includes('alta')) return false;
  if (tipo.includes('freezer')) return true;
  return tipo.includes('geladeira') && getDegeloStats(eq, allocations).majority;
}

function getPowerGroupsByEquipment(equipment, allocations) {
  const groups = {};
  let groupIndex = 0;
  let run = [];
  const flush = () => {
    for (let index = 0; index + 2 < run.length; index += 3) {
      groupIndex += 1;
      run.slice(index, index + 3).forEach((eq, position) => {
        groups[eq.id] = { groupIndex, position:position + 1, size:3 };
      });
    }
    run = [];
  };

  (equipment || []).forEach((eq) => {
    if (!isColdEquipment(eq)) return;
    if (isPowerColdEquipment(eq, allocations)) run.push(eq);
    else flush();
  });
  flush();
  return groups;
}

function FillStreetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display:'block' }} aria-hidden="true">
      <path d="M2 2h8M2 5h8M2 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 6.2v3.1m0 0 1.4-1.4M8 9.3 6.6 7.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ size=13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'block' }} aria-hidden="true">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// ── Fill bar ──────────────────────────────────────────────────────────────────
function FillBar({ filled, total }) {
  const pct = total>0 ? Math.round(filled/total*100) : 0;
  const color = pct>=75?'#0DAB77':pct>=40?'#F59C00':'#EF4444';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ fontSize:10, fontWeight:800, color, minWidth:30, textAlign:'right', fontFamily:'var(--font-numeric)' }}>{pct}%</span>
      <div style={{ width:30, height:3, background:'rgba(0,0,0,0.12)', borderRadius:2 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2, transition:'width 0.2s' }} />
      </div>
    </div>
  );
}

function productPhotoUrl(product) {
  const raw = String(product?.photoUrl || product?.photo_url || product?.raw?.photo_url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  if (['sem foto', 'n/a', 'na', 'none', 'null', 'nan'].includes(raw.toLowerCase())) return '';
  return raw;
}

function getPlanogramSlotWidth(escW) {
  return Math.max(96, Math.min(128, Math.round(escW * 1.85)));
}

function PlanogramProductFace({ product, compact }) {
  if (!product) return null;
  const photoUrl = productPhotoUrl(product);
  const curvaColor = CURVA_COLOR[product.curva] || '#94A3B8';
  const groupStyle = GROUP_STYLE[product.grupo] || GROUP_STYLE.Neutro;
  const flags = typeof DSE_getFlags === 'function' ? DSE_getFlags(product) : [];
  return (
    <div style={{ minHeight:0, height:'100%', display:'flex', flexDirection:'column', alignItems:'stretch', gap:4 }}>
      <div style={{ display:'flex', alignItems:'center', gap:4, minHeight:14 }}>
        <span style={{ fontSize:9, fontWeight:900, color:curvaColor, background:`${curvaColor}1F`, borderRadius:3, padding:'1px 4px', lineHeight:1.15 }}>{product.curva || '-'}</span>
        <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:8, fontWeight:800, color:groupStyle.text }}>{product.grupo || ''}</span>
        {flags.length > 0 && (
          <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:3, flexShrink:0 }}>
            {flags.map(f => (
              DSEFlagBadge
                ? <DSEFlagBadge key={f} type={f} size={compact?9:11} />
                : <span key={f} style={{ fontSize:compact?9:11, color:'#64748B', fontWeight:900 }}>!</span>
            ))}
          </span>
        )}
      </div>
      <div style={{ flex:'1 1 auto', minHeight:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff', borderRadius:5, border:'1px solid rgba(15,23,42,0.08)', overflow:'hidden' }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={product.nome}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', padding:compact?2:4, boxSizing:'border-box' }}
          />
        ) : (
          <span style={{ padding:6, textAlign:'center', color:'rgba(71,85,105,0.62)', fontSize:compact?8:9, fontWeight:800, lineHeight:1.15 }}>Sem foto</span>
        )}
      </div>
      <div title={product.nome} style={{ minHeight:compact?22:30, color:'var(--map-text)', fontSize:compact?8:9, fontWeight:800, lineHeight:1.12, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:compact?2:3, WebkitBoxOrient:'vertical' }}>
        {product.nome}
      </div>
    </div>
  );
}

function PlanogramSlot({ slot, width, height, isHighlighted, matchSearch, subcatMatch, onEscClick, onHoverEsc, onHoverEnd }) {
  const product = slot.p1 || slot.p2;
  const groupStyle = GROUP_STYLE[product?.grupo] || GROUP_STYLE.Neutro;
  const borderColor = product ? (groupStyle.text || '#94A3B8') : 'rgba(148,163,184,0.42)';
  const dual = !!(slot.p1 && slot.p2);
  const addressLabel = slotShortLabel(slot.escsId);
  const isLocked = !!slot.isLocked;
  const outline = isHighlighted ? '4px solid #DC2626' : matchSearch ? '2px solid #F59C00' : slot.sameSubcatLevelConflict ? '2px dashed #DC2626' : 'none';
  return (
    <div
      data-location-id={slot.escsId}
      data-pid={product?.id || undefined}
      title={slot.sameSubcatLevelConflict ? 'Subcategoria repetida neste nível com outro SKU' : (product?.nome || slot.escsId)}
      onClick={e=>onEscClick&&onEscClick(slot.escsId,slot.p1,slot.p2,e)}
      onMouseEnter={()=>product&&onHoverEsc&&onHoverEsc(slot.escsId,slot.p1,slot.p2)}
      onMouseLeave={()=>onHoverEnd&&onHoverEnd()}
      style={{
        width,
        height,
        flexShrink:0,
        padding:5,
        borderRadius:6,
        border:`1px solid ${isLocked ? 'rgba(220,38,38,0.62)' : `${borderColor}66`}`,
        background:isLocked ? 'rgba(254,226,226,0.62)' : (product ? groupStyle.bg : 'rgba(248,250,252,0.45)'),
        outline,
        outlineOffset:isHighlighted?'3px':'0px',
        opacity:subcatMatch?1:0.25,
        filter:isLocked?'saturate(0.52) brightness(0.97)':'none',
        cursor:'pointer',
        boxSizing:'border-box',
        overflow:'hidden',
        position:'relative',
        zIndex:isHighlighted?20:'auto',
        animation:isHighlighted?'dse-highlight-pulse 0.75s ease-in-out 8':'none',
      }}
    >
      {!product ? (
        <div style={{ height:'100%', border:'1px dashed rgba(148,163,184,0.38)', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--map-text-muted)', fontSize:9, fontWeight:800 }}>
          <span style={{ position:'absolute', top:7, left:7, fontSize:8, fontWeight:900, color:isLocked?'#B91C1C':'#475569', background:'rgba(255,255,255,0.84)', border:`1px solid ${isLocked?'rgba(239,68,68,0.42)':'rgba(148,163,184,0.28)'}`, borderRadius:3, padding:'2px 4px', fontFamily:'var(--font-numeric)' }}>{addressLabel}</span>
          vazio
        </div>
      ) : dual ? (
        <div style={{ height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
          <PlanogramProductFace product={slot.p1} compact />
          <PlanogramProductFace product={slot.p2} compact />
        </div>
      ) : (
        <PlanogramProductFace product={product} />
      )}
      {product && (
        <span style={{ position:'absolute', top:7, right:7, fontSize:8, fontWeight:900, color:isLocked?'#B91C1C':'#475569', background:'rgba(255,255,255,0.88)', border:`1px solid ${isLocked?'rgba(239,68,68,0.42)':'rgba(148,163,184,0.28)'}`, borderRadius:3, padding:'2px 4px', fontFamily:'var(--font-numeric)' }}>
          {addressLabel}
        </span>
      )}
      {isLocked && <div style={{ position:'absolute', inset:0, border:'2px solid rgba(220,38,38,0.72)', background:'repeating-linear-gradient(135deg, rgba(220,38,38,0.10) 0 7px, transparent 7px 14px)', pointerEvents:'none', borderRadius:6 }} />}
    </div>
  );
}

// ── Equipment ⋮ menu ──────────────────────────────────────────────────────────
function EquipMenu({ eq, streetId, dispatch, onClose, onStartSwap, position }) {
  const [mode, setMode] = useState(null);
  const [renameVal, setRenameVal] = useState(eq.id);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    setTimeout(()=>document.addEventListener('mousedown',h),50);
    return ()=>document.removeEventListener('mousedown',h);
  }, []);

  const cfg = getEquipCfg(eq.tipo);

  const item = (label,onClick,opts={})=>(
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:7, width:'100%', padding:'6px 10px', borderRadius:4, border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:'transparent', color:opts.danger?'#9E1028':'var(--dropdown-text)', fontSize:11, fontWeight:500 }}
      onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      {opts.icon&&<span style={{ fontSize:12, width:14, textAlign:'center' }}>{opts.icon}</span>}
      {label}
    </button>
  );

  return (
    <div ref={menuRef} onClick={e=>e.stopPropagation()} style={{ position:'fixed', left:position?.x||0, top:position?.y||0, zIndex:500, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:7, padding:4, minWidth:196, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
      {mode==='type' && (<>
        <div style={{ padding:'5px 10px 3px', fontSize:9, fontWeight:700, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Alterar tipo</div>
        {ALL_TYPES.map(t=>(
          <button key={t.id} onClick={()=>{dispatch({type:'CHANGE_EQUIP_TYPE',equipId:eq.id,tipo:t.id});onClose();}} style={{ display:'flex', alignItems:'center', gap:7, width:'100%', padding:'5px 10px', borderRadius:4, border:'none', cursor:'pointer', fontFamily:'var(--font-sans)', fontSize:11, fontWeight:500, background:eq.tipo===t.id?`${t.borderColor}18`:'transparent', color:eq.tipo===t.id?t.color:'var(--dropdown-text)' }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
            onMouseLeave={e=>e.currentTarget.style.background=eq.tipo===t.id?`${t.borderColor}18`:'transparent'}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:t.borderColor, flexShrink:0 }} />
            {t.label}
            {eq.tipo===t.id&&<span style={{ marginLeft:'auto', color:t.color, fontSize:10 }}>✓</span>}
          </button>
        ))}
        <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
        {item('← Voltar',()=>setMode(null),{icon:'←'})}
      </>)}
      {mode==='rename' && (
        <div style={{ padding:'8px 10px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--dropdown-text)', marginBottom:6 }}>Renomear equipamento</div>
          <input
            value={renameVal}
            onChange={e=>setRenameVal(e.target.value)}
            autoFocus
            onKeyDown={e=>{ if(e.key==='Enter'){ const v=renameVal.trim(); if(v&&v!==eq.id) dispatch({type:'RENAME_EQUIP',oldId:eq.id,newId:v}); onClose(); } if(e.key==='Escape') setMode(null); }}
            style={{ width:'100%', padding:'5px 8px', fontSize:11, fontFamily:'var(--font-numeric)', background:'var(--cfg-input-bg)', border:'1px solid var(--dropdown-border)', borderRadius:4, color:'var(--dropdown-text)', outline:'none', marginBottom:4 }}
          />
          <div style={{ fontSize:9, color:'var(--map-text-muted)', marginBottom:8, lineHeight:1.4 }}>Salvar atualiza o equipamento na planilha e reordena pelo número.</div>
          <div style={{ display:'flex', gap:5 }}>
            <button
              onClick={()=>{ const v=renameVal.trim(); if(v&&v!==eq.id) dispatch({type:'RENAME_EQUIP',oldId:eq.id,newId:v}); onClose(); }}
              disabled={!renameVal.trim()||renameVal.trim()===eq.id}
              style={{ flex:1, padding:'5px', fontSize:10, fontWeight:700, background:'var(--shopper-green)', border:'none', borderRadius:4, color:'#fff', cursor:'pointer', fontFamily:'var(--font-sans)', opacity:renameVal.trim()&&renameVal.trim()!==eq.id?1:0.4 }}>
              Salvar
            </button>
            <button onClick={()=>setMode(null)} style={{ padding:'5px 10px', fontSize:10, background:'transparent', border:'1px solid var(--dropdown-border)', borderRadius:4, color:'var(--dropdown-text)', cursor:'pointer', fontFamily:'var(--font-sans)' }}>Cancelar</button>
          </div>
        </div>
      )}
      {mode==='confirmRemove' && (
        <div style={{ padding:'8px 10px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9E1028', marginBottom:4 }}>Remover {eq.id}?</div>
          <div style={{ fontSize:10, color:'var(--map-text-muted)', marginBottom:8, lineHeight:1.5 }}>Remove o equipamento e move os produtos alocados para Recolhidos. Não pode ser desfeito.</div>
          <div style={{ display:'flex', gap:5 }}>
            <button onClick={()=>{dispatch({type:'REMOVE_EQUIP',equipId:eq.id});onClose();}} style={{ flex:1, padding:'5px', fontSize:10, fontWeight:700, background:'#9E1028', border:'none', borderRadius:4, color:'#fff', cursor:'pointer', fontFamily:'var(--font-sans)' }}>Confirmar</button>
            <button onClick={()=>setMode(null)} style={{ padding:'5px 10px', fontSize:10, background:'transparent', border:'1px solid var(--dropdown-border)', borderRadius:4, color:'var(--dropdown-text)', cursor:'pointer', fontFamily:'var(--font-sans)' }}>Cancelar</button>
          </div>
        </div>
      )}
      {!mode && (<>
        {item('Alterar tipo →',()=>setMode('type'),{icon:'◈'})}
        {item('Renomear equipamento',()=>{setRenameVal(eq.id);setMode('rename');},{icon:'✎'})}
        <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
        {item('Trocar conteúdo com…',()=>{onStartSwap(eq.id);onClose();},{icon:'⇄'})}
        {item('Recolher produtos',()=>{dispatch({type:'COLLECT_EQUIP',equipId:eq.id});onClose();},{icon:'↙'})}
        {item('Recolher só 2º slot',()=>{dispatch({type:'COLLECT_EQUIP_SLOT',equipId:eq.id,slot:2});onClose();},{icon:'2×'})}

        <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
        {item('Remover equipamento',()=>setMode('confirmRemove'),{icon:'✕',danger:true})}
      </>)}
    </div>
  );
}

// ── Equipment card ─────────────────────────────────────────────────────────────
const EquipmentCard = memo(function EquipmentCard({ eq, streetId, allocations, hasAllocationSource, onEscClick, onHoverEsc, onHoverEnd, isCollapsed, onToggleCollapse, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, highlightProductId, subcatFilters=[], escW, pendingEquipmentTypeChanges={}, planogramMode=false, onTogglePlanogram, powerGroup=null, verticalLaneLocks=[], onToggleVerticalLaneLock, onFillVerticalLane }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({x:0,y:0});
  const menuBtnRef = useRef(null);
  const [hovHeader, setHovHeader] = useState(false);
  const [hovEquipment, setHovEquipment] = useState(false);
  const cfg = getEquipCfg(eq.tipo);
  const isTypePending = !!pendingEquipmentTypeChanges[eq.id];
  const isCard175 = !!eq.card175Only;
  const isDark = document.documentElement.getAttribute('data-dse-theme')==='dark';
  const hdrBg = isCard175
    ? (isDark ? '#1A0508' : '#FBE8EA')
    : (isDark ? cfg.headerBgD : cfg.headerBgL);

  const stats = useMemo(()=>{
    let f=0,t=0,dual=0;
    for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){
      t++;
      const alloc = allocations[`${eq.id}-${n}-${s}`] || {};
      if(alloc.p1) f++;
      if(alloc.p1 && alloc.p2) dual++;
    }
    return {filled:f,total:t,dual};
  },[eq,allocations]);

  const productCounts = useMemo(()=>{
    const counts = {};
    for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){
      const productId = allocations[`${eq.id}-${n}-${s}`]?.p1;
      if(productId) counts[productId] = (counts[productId] || 0) + 1;
    }
    return counts;
  },[eq,allocations]);

  const dominantCurva = useMemo(()=>getDominantCurva(eq,allocations),[eq,allocations]);
  const dominantGroup = useMemo(()=>getDominantGroup(eq,allocations),[eq,allocations]);
  const degeloStats = useMemo(()=>getDegeloStats(eq,allocations),[eq,allocations]);
  const collapsedGroupStyle = useMemo(() => {
    if (!isCollapsed || !dominantGroup) return null;
    if (!['Químico', 'Perfumaria'].includes(dominantGroup.group)) return null;
    return GROUP_STYLE[dominantGroup.group] || null;
  }, [isCollapsed, dominantGroup]);

  const isSwapSource   = swapSource === eq.id;
  const isSwapTarget   = swapSource && swapSource !== eq.id;
  const hasDualSlots = stats.dual > 0;
  const showDegeloBadge = isCollapsed && degeloStats.majority && String(eq.tipo || '').includes('geladeira');
  const swapBorderColor = isSwapSource ? '#F59C00' : (isSwapTarget ? 'rgba(245,156,0,0.4)' : (hasDualSlots ? '#8B5CF6' : (showDegeloBadge ? '#38BDF8' : (collapsedGroupStyle ? collapsedGroupStyle.text : (isCard175 ? '#C41230' : cfg.borderColor)))));
  const effectiveHdrBg = hasDualSlots ? 'rgba(139,92,246,0.13)' : (showDegeloBadge ? 'rgba(56,189,248,0.13)' : (collapsedGroupStyle ? collapsedGroupStyle.bg : hdrBg));
  const lockedLanePositions = useMemo(() => {
    const out = new Set();
    for (let pos = 1; pos <= eq.escsPerNivel; pos += 1) {
      if (isVerticalLaneLockedHelper(eq.id, pos, verticalLaneLocks)) out.add(pos);
    }
    return out;
  }, [eq.id, eq.escsPerNivel, verticalLaneLocks]);
  const showLaneControls = hovEquipment || lockedLanePositions.size > 0;

  const labelW=24, gap=3; // escW is now passed as prop (standardized to geladeira 5-slot size)

  const handleHeaderClick = () => {
    if (isSwapTarget) { onCompleteSwap(eq.id); return; }
    onToggleCollapse();
  };

  return (
    <div data-equipment-id={eq.id}
      onMouseEnter={()=>setHovEquipment(true)}
      onMouseLeave={()=>setHovEquipment(false)}
      style={{ borderLeft: `4px solid ${swapBorderColor}`, background:'var(--map-equip-bg)', borderRadius:6, overflow:'visible', boxShadow: isSwapSource?`0 0 0 2px #F59C00`:(hasDualSlots?`0 0 0 2px rgba(139,92,246,0.34), 0 2px 12px rgba(139,92,246,0.16)`:(isCard175?`0 0 0 2px #C41230, 0 2px 12px rgba(196,18,48,0.35)`:'var(--map-equip-shadow)')), marginBottom:6, flexShrink:0, position:'relative', transition:'box-shadow 0.15s' }}>
      <div style={{ background:effectiveHdrBg, padding:'0 8px', height:34, display:'flex', alignItems:'center', gap:6, cursor:'pointer', userSelect:'none', borderRadius:'2px 5px 0 0', position:'relative' }}
        onClick={handleHeaderClick}
        onMouseEnter={()=>setHovHeader(true)}
        onMouseLeave={()=>{ if(!menuOpen) setHovHeader(false); }}>

        {/* Dominant curva badge */}
        {dominantCurva ? (
          <div style={{ width:22, height:22, borderRadius:'50%', background:CURVA_COLOR[dominantCurva], display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ fontSize:10, fontWeight:800, color:'#fff' }}>{dominantCurva}</span>
          </div>
        ) : (
          <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(0,0,0,0.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ fontSize:9, color:'rgba(0,0,0,0.2)' }}>—</span>
          </div>
        )}

        <span style={{ fontSize:13, fontWeight:800, color:cfg.color, fontFamily:'var(--font-numeric)', letterSpacing:'0.05em', flexShrink:0 }}>{eq.id}</span>
        <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:`${cfg.borderColor}18`, padding:'1px 5px', borderRadius:10, flexShrink:0, lineHeight:1.8 }}>{cfg.label}</span>
        {isTypePending && (
          <span title="Tipo alterado localmente. Será gravado ao salvar a versão." style={{ fontSize:8, fontWeight:800, color:'#B87200', background:'rgba(245,156,0,0.18)', border:'1px solid rgba(245,156,0,0.35)', padding:'1px 5px', borderRadius:4, flexShrink:0, letterSpacing:'0.05em' }}>PENDENTE</span>
        )}
        {isCard175 && (
          <span title="Equipamento presente apenas no Card 788" style={{ fontSize:7, fontWeight:800, color:'#C41230', background:'rgba(196,18,48,0.18)', border:'1px solid rgba(196,18,48,0.35)', padding:'1px 5px', borderRadius:4, flexShrink:0, letterSpacing:'0.04em' }}>CARD 788</span>
        )}
        {collapsedGroupStyle && (
          <span title={`${dominantGroup.group}: ${dominantGroup.count} de ${dominantGroup.total} produto(s) neste equipamento`} style={{ fontSize:8, fontWeight:900, color:collapsedGroupStyle.text, background:collapsedGroupStyle.bg, border:`1px solid ${collapsedGroupStyle.text}55`, padding:'1px 5px', borderRadius:4, flexShrink:0, letterSpacing:'0.04em' }}>
            {dominantGroup.group === 'Químico' ? 'QMC' : 'PRF'}
          </span>
        )}
        {showDegeloBadge && (
          <span title={`Degelo = NÃO: ${degeloStats.count} de ${degeloStats.total} produto(s) neste equipamento`} style={{ fontSize:10, fontWeight:900, color:'#0284C7', background:'rgba(56,189,248,0.16)', border:'1px solid rgba(56,189,248,0.42)', padding:'1px 5px', borderRadius:4, flexShrink:0, lineHeight:1.35 }}>
            ❄
          </span>
        )}
        {powerGroup && (
          <span title={`Grupo de gerador formado: equipamento ${powerGroup.position} de ${powerGroup.size}`} style={{ fontSize:10, fontWeight:900, color:'#A15C00', background:'rgba(250,204,21,0.24)', border:'1px solid rgba(250,204,21,0.58)', padding:'1px 5px', borderRadius:4, flexShrink:0, lineHeight:1.35 }}>
            ⚡3
          </span>
        )}
        {hasDualSlots && (
          <span title={`${stats.dual} escaninho(s) com 2 produtos. Alt+clique recolhe/aloca só o 2º slot; Alt+Shift vale para o nível; Alt+Cmd/Ctrl vale para o equipamento.`} style={{ fontSize:9, fontWeight:900, color:'#6D28D9', background:'rgba(139,92,246,0.18)', border:'1px solid rgba(139,92,246,0.45)', padding:'1px 5px', borderRadius:4, flexShrink:0, lineHeight:1.35 }}>
            2× {stats.dual}
          </span>
        )}

        {/* Swap indicator */}
        {isSwapSource && <span style={{ fontSize:9, fontWeight:700, color:'#F59C00', marginLeft:2 }}>aguardando…</span>}
        {isSwapTarget && <span style={{ fontSize:9, fontWeight:700, color:'#F59C00', opacity:0.7 }}>⇄ trocar</span>}

        <div style={{ flex:1 }} />
        <FillBar filled={stats.filled} total={stats.total} />
        {!isCollapsed && (
          <button
            type="button"
            title={planogramMode ? 'Voltar para visão operacional' : 'Ver planograma com fotos'}
            onClick={e=>{ e.stopPropagation(); onTogglePlanogram&&onTogglePlanogram(eq.id); }}
            style={{
              width:22,
              height:22,
              flexShrink:0,
              marginLeft:2,
              background:planogramMode?`${cfg.borderColor}24`:'transparent',
              border:`1px solid ${planogramMode?cfg.borderColor:'transparent'}`,
              borderRadius:4,
              cursor:'pointer',
              color:planogramMode?cfg.color:'var(--map-text-muted)',
              fontSize:12,
              fontWeight:900,
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              fontFamily:'var(--font-sans)',
              lineHeight:1,
            }}
          >
            <EyeIcon />
          </button>
        )}
        <span style={{ fontSize:10, color:cfg.color, opacity:0.6, flexShrink:0, marginLeft:2 }}>{isCollapsed?'▶':'▼'}</span>

        {(hovHeader||menuOpen) && (
          <div style={{ position:'relative', flexShrink:0, marginLeft:2 }} onClick={e=>e.stopPropagation()}>
            <button ref={menuBtnRef} onClick={e=>{
              e.stopPropagation();
              if (!menuOpen && menuBtnRef.current) {
                const r=menuBtnRef.current.getBoundingClientRect();
                const MW=200, MH=320, vh=window.innerHeight;
                const yB=r.bottom+4;
                const yA=r.top-MH-4;
                setMenuPos({
                  x: Math.max(8, Math.min(r.right-MW, window.innerWidth-MW-8)),
                  y: yB+MH>vh-8 ? Math.max(8,yA) : yB,
                });
              }
              setMenuOpen(v=>!v);
            }}
              style={{ width:22, height:22, background:menuOpen?`${cfg.borderColor}25`:'transparent', border:`1px solid ${menuOpen?cfg.borderColor:'transparent'}`, borderRadius:4, cursor:'pointer', fontSize:13, color:cfg.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ⋮
            </button>
            {menuOpen && <EquipMenu eq={eq} streetId={streetId} dispatch={dispatch} onClose={()=>{setMenuOpen(false);setHovHeader(false);}} onStartSwap={onStartSwap} position={menuPos} />}
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div key={planogramMode?'planogram':'operational'} style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:planogramMode?6:3, overflowX:'visible', overflowY:'visible' }}>
          {showLaneControls && (
            <div style={{ display:'flex', alignItems:'center', gap, flexWrap:'nowrap', minWidth:labelW + eq.escsPerNivel * ((planogramMode ? getPlanogramSlotWidth(escW) : escW) + gap), marginBottom:2, opacity:showLaneControls?1:0, transition:'opacity 0.12s' }}>
              <span style={{ width:labelW, flexShrink:0 }} />
              {Array.from({ length:eq.escsPerNivel }, (_, si) => {
                const pos = si + 1;
                const locked = lockedLanePositions.has(pos);
                const laneW = planogramMode ? getPlanogramSlotWidth(escW) : escW;
                return (
                  <div key={`lane-${pos}`} style={{ width:laneW, height:20, flexShrink:0, display:'flex', gap:3, alignItems:'center', justifyContent:'center' }}>
                    <button
                      type="button"
                      title={`Preencher coluna ${pos}`}
                      onClick={(event) => { event.stopPropagation(); onFillVerticalLane && onFillVerticalLane(eq.id, pos); }}
                      style={{ width:20, height:18, border:'1px solid rgba(13,171,119,0.35)', borderRadius:4, background:'rgba(13,171,119,0.10)', color:'#0DAB77', cursor:'pointer', fontSize:12, fontWeight:900, lineHeight:1 }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      title={locked ? `Desbloquear coluna ${pos}` : `Bloquear coluna ${pos} em ações em massa`}
                      onClick={(event) => { event.stopPropagation(); onToggleVerticalLaneLock && onToggleVerticalLaneLock(eq.id, pos); }}
                      style={{ width:20, height:18, border:`1px solid ${locked ? 'rgba(220,38,38,0.62)' : 'rgba(100,116,139,0.24)'}`, borderRadius:4, background:locked ? 'rgba(220,38,38,0.16)' : 'rgba(248,250,252,0.72)', color:locked ? '#DC2626' : '#94A3B8', cursor:'pointer', fontSize:12, fontWeight:900, lineHeight:1 }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {Array.from({length:eq.niveis},(_,ni)=>{
            const nivel=ni+1;
            // Build slot data for this row
            const slots = Array.from({length:eq.escsPerNivel},(_,si)=>{
              const pos=si+1, escsId=`${eq.id}-${nivel}-${pos}`;
              const alloc=allocations[escsId]||{};
              const p1=alloc.p1?PRODUCT_MAP[alloc.p1]:null;
              const p2=alloc.p2?PRODUCT_MAP[alloc.p2]:null;
              return { pos, escsId, alloc, p1, p2, p1id:alloc.p1||null, isLocked:lockedLanePositions.has(pos) };
            });
            const subcatCodes = {};
            slots.forEach(slot => {
              [slot.p1, slot.p2].forEach(product => {
                const sub = normalizeSearchText(product?.sub);
                const code = parseBoardEntryCode(product?.id);
                if (!sub || !code) return;
                if (!subcatCodes[sub]) subcatCodes[sub] = new Set();
                subcatCodes[sub].add(code);
              });
            });
            const repeatedSubcats = new Set(
              Object.entries(subcatCodes)
                .filter(([, codes]) => codes.size > 1)
                .map(([sub]) => sub)
            );
            slots.forEach(slot => {
              slot.sameSubcatLevelConflict = [slot.p1, slot.p2].some(product => (
                product?.sub && repeatedSubcats.has(normalizeSearchText(product.sub))
              ));
            });
            // Group consecutive same-product slots (only filled)
            const runs=[];
            let cur=null;
            for(const slot of slots){
              if(slot.p1id && cur && cur.p1id===slot.p1id){ cur.slots.push(slot); }
              else{ if(cur) runs.push(cur); cur={ p1id:slot.p1id, slots:[slot] }; }
            }
            if(cur) runs.push(cur);
            if (planogramMode) {
              const planW = getPlanogramSlotWidth(escW);
              const planH = 132;
              const normalizedQuery = normalizeSearchText(searchQuery);
              const normalizedHighlight = parseBoardEntryCode(highlightProductId);
              return (
                <div key={nivel} style={{ display:'flex', alignItems:'stretch', gap, flexWrap:'nowrap', minWidth:labelW + eq.escsPerNivel * (planW + gap) }}>
                  <span style={{ width:labelW, fontSize:9, fontWeight:700, color:'var(--map-text-muted)', fontFamily:'var(--font-numeric)', textAlign:'right', paddingRight:4, flexShrink:0, alignSelf:'center' }}>{nivel}</span>
                  {runs.map((run,ri) => {
                    const isGroup = !!run.p1id && (run.slots.length>1 || (productCounts[run.p1id] || 0)>1);
                    const groupStyle = isGroup ? (GROUP_STYLE[run.slots[0].p1?.grupo] || GROUP_STYLE.Neutro) : null;
                    const groupConflict = run.slots.some(slot => slot.sameSubcatLevelConflict);
                    const groupSubcatActive = subcatFilters.length>0;
                    const groupSubcatMatch=!groupSubcatActive||(run.slots[0].p1&&subcatFilters.includes(run.slots[0].p1.sub))||run.slots.some(slot => !slot.p1 && !slot.p2);
                    const renderSlot = (slot) => {
                      const matchSearch=searchQuery&&(normalizeSearchText(slot.p1?.nome).includes(normalizedQuery)||normalizeSearchText(slot.p1?.id).includes(normalizedQuery)||normalizeSearchText(slot.p2?.nome).includes(normalizedQuery)||normalizeSearchText(slot.p2?.id).includes(normalizedQuery));
                      const isHighlighted=normalizedHighlight&&(slot.p1?.id===normalizedHighlight||slot.p2?.id===normalizedHighlight);
                      const subcatActive = subcatFilters.length>0;
                      const subcatMatch=!subcatActive||(!slot.p1&&!slot.p2)||(slot.p1&&subcatFilters.includes(slot.p1.sub))||(slot.p2&&subcatFilters.includes(slot.p2.sub));
                      return (
                        <PlanogramSlot
                          key={slot.pos}
                          slot={slot}
                          width={planW}
                          height={planH}
                          isHighlighted={isHighlighted}
                          matchSearch={matchSearch}
                          subcatMatch={subcatMatch}
                          onEscClick={onEscClick}
                          onHoverEsc={onHoverEsc}
                          onHoverEnd={onHoverEnd}
                        />
                      );
                    };
                    if (!isGroup) return React.cloneElement(renderSlot(run.slots[0]), { key:`plan-slot-${run.slots[0].pos}` });
                    return (
                      <div
                        key={`plan-run-${ri}`}
                        title={groupConflict ? 'Subcategoria repetida neste nível com outro SKU' : run.slots[0].p1?.nome}
                        style={{
                          display:'flex',
                          gap:3,
                          padding:3,
                          borderRadius:8,
                          outline:groupConflict?'2px dashed #DC2626':`2px solid ${groupStyle.text || '#64748B'}`,
                          background:groupConflict?'rgba(220,38,38,0.08)':`${groupStyle.text || '#64748B'}10`,
                          flexShrink:0,
                          opacity:groupSubcatMatch?1:0.25,
                          transition:'opacity 0.15s',
                        }}
                      >
                        {run.slots.map(renderSlot)}
                      </div>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={nivel} style={{ display:'flex', alignItems:'center', gap, flexWrap:'nowrap' }}>
                <span style={{ width:labelW, fontSize:9, fontWeight:700, color:'var(--map-text-muted)', fontFamily:'var(--font-numeric)', textAlign:'right', paddingRight:4, flexShrink:0 }}>{nivel}</span>
                {runs.map((run,ri)=>{
                  const isGroup = !!run.p1id && (run.slots.length>1 || (productCounts[run.p1id] || 0)>1);
                  const groupColor = isGroup ? ((GROUP_STYLE[run.slots[0].p1?.grupo] || GROUP_STYLE.Neutro).text || '#64748B') : null;
                  const subcatActive = subcatFilters.length>0;
                  if(!isGroup){
                    const slot=run.slots[0];
                    const normalizedQuery = normalizeSearchText(searchQuery);
                    const matchSearch=searchQuery&&(normalizeSearchText(slot.p1?.nome).includes(normalizedQuery)||normalizeSearchText(slot.p1?.id).includes(normalizedQuery)||normalizeSearchText(slot.p2?.nome).includes(normalizedQuery)||normalizeSearchText(slot.p2?.id).includes(normalizedQuery));
                        const normalizedHighlight = parseBoardEntryCode(highlightProductId);
                        const isHighlighted=normalizedHighlight&&(slot.p1?.id===normalizedHighlight||slot.p2?.id===normalizedHighlight);
                        const subcatMatch=!subcatActive||(!slot.p1&&!slot.p2)||(slot.p1&&subcatFilters.includes(slot.p1.sub))||(slot.p2&&subcatFilters.includes(slot.p2.sub));
                        const conflictOutline = slot.sameSubcatLevelConflict ? '2px dashed #DC2626' : 'none';
                        const conflictTitle = slot.sameSubcatLevelConflict ? 'Subcategoria repetida neste nível com outro SKU' : undefined;
                        return (
                          <div key={ri} title={conflictTitle} style={{ width:escW, flexShrink:0, outline:isHighlighted?'4px solid #DC2626':matchSearch?'2px solid #F59C00':conflictOutline, outlineOffset:isHighlighted?'3px':'0px', borderRadius:6, animation:isHighlighted?'dse-highlight-pulse 0.75s ease-in-out 8':'none', opacity:subcatMatch?1:0.25, transition:'opacity 0.15s', position:'relative', zIndex:isHighlighted?20:'auto', background:isHighlighted?'rgba(220,38,38,0.10)':slot.sameSubcatLevelConflict?'rgba(220,38,38,0.08)':'transparent' }}>
                            <DSEEscaninho escaninhoId={slot.escsId} product1={slot.p1} product2={slot.p2} isEmpty={!slot.p1}
                          isAllocating={hasAllocationSource&&(!slot.p1 || !slot.p2)} isHighlighted={isHighlighted}
                          isLocked={slot.isLocked}
                          equipCap={eq.cap}
                          onClick={onEscClick}
                          onHover={onHoverEsc}
                          onHoverEnd={onHoverEnd}
                        />
                      </div>
                    );
                  }
                  // Grouped: same product across multiple consecutive slots
                  const groupSubcatMatch=!subcatActive||(run.slots[0].p1&&subcatFilters.includes(run.slots[0].p1.sub));
                  const groupConflict = run.slots.some(slot => slot.sameSubcatLevelConflict);
                  return (
                    <div key={ri} title={groupConflict ? 'Subcategoria repetida neste nível com outro SKU' : undefined} style={{ display:'flex', gap:1, outline:groupConflict?'2px dashed #DC2626':`2px solid ${groupColor}`, borderRadius:6, padding:2, background:groupConflict?'rgba(220,38,38,0.08)':`${groupColor}10`, flexShrink:0, position:'relative', opacity:groupSubcatMatch?1:0.25, transition:'opacity 0.15s' }}>
                      {run.slots.map(slot=>{
                        const normalizedHighlight = parseBoardEntryCode(highlightProductId);
                        const isHighlighted=normalizedHighlight&&(slot.p1?.id===normalizedHighlight||slot.p2?.id===normalizedHighlight);
                        return (
                          <div key={slot.pos} style={{ width:escW, flexShrink:0, outline:isHighlighted?'4px solid #DC2626':'none', outlineOffset:isHighlighted?'3px':'0px', borderRadius:6, animation:isHighlighted?'dse-highlight-pulse 0.75s ease-in-out 8':'none', position:'relative', zIndex:isHighlighted?20:'auto', background:isHighlighted?'rgba(220,38,38,0.10)':'transparent' }}>
                            <DSEEscaninho escaninhoId={slot.escsId} product1={slot.p1} product2={slot.p2} isEmpty={false}
                              isAllocating={false} isHighlighted={isHighlighted}
                              isLocked={slot.isLocked}
                              equipCap={eq.cap}
                              onClick={onEscClick}
                              onHover={onHoverEsc}
                              onHoverEnd={onHoverEnd}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ── Street column ──────────────────────────────────────────────────────────────
const StreetColumn = memo(function StreetColumn({ street, allocations, hasAllocationSource, onEscClick, onHoverEsc, onHoverEnd, equipCollapsed, onToggleEquip, isCollapsed, onToggleStreet, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, highlightProductId, onRecolherRua, onFillStreet, globalEquipmentFilter='all', globalPlanogramMode=false, subcatFilters=[], pendingEquipmentTypeChanges={}, verticalLaneLocks=[], onToggleVerticalLaneLock, onFillVerticalLane }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [fillRunning, setFillRunning] = useState(false);
  const [fillStatus, setFillStatus] = useState('');
  const [fillProgress, setFillProgress] = useState(null);
  const [newEquipTipo, setNewEquipTipo] = useState('prateleira');
  const [newEquipOpen, setNewEquipOpen] = useState(false);
  const [forceVisibleEquipmentIds, setForceVisibleEquipmentIds] = useState({});
  const [pairFilter, setPairFilter] = useState('all');
  const [typeFilters, setTypeFilters] = useState([]);
  const [planogramEquipment, setPlanogramEquipment] = useState({});
  const stats = useMemo(()=>{
    let f=0,t=0;
    street.equipment.forEach(eq=>{ for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){ t++; if(allocations[`${eq.id}-${n}-${s}`]?.p1) f++; } });
    return {filled:f,total:t,pct:t>0?Math.round(f/t*100):0};
  },[street,allocations]);

  const equipTypes = useMemo(()=>[...new Set(street.equipment.map(eq=>eq.tipo))],[street.equipment]);

  const visibleEquipment = useMemo(()=>{
    const highlightedCode = parseBoardEntryCode(highlightProductId);
    const equipmentHasHighlight = (eq) => {
      if (!highlightedCode) return false;
      for (let level = 1; level <= eq.niveis; level += 1) {
        for (let pos = 1; pos <= eq.escsPerNivel; pos += 1) {
          const alloc = allocations[`${eq.id}-${level}-${pos}`] || {};
          if (parseBoardEntryCode(alloc.p1) === highlightedCode || parseBoardEntryCode(alloc.p2) === highlightedCode) return true;
        }
      }
      return false;
    };
    return street.equipment.filter(eq=>{
      if (equipmentHasHighlight(eq) || forceVisibleEquipmentIds[eq.id]) return true;
      if (!equipmentMatchesGlobalFilter(eq, globalEquipmentFilter)) return false;
      if (pairFilter!=='all') {
        const num = parseInt(eq.id.split('-').pop()||'0');
        if (pairFilter==='even' && num%2!==0) return false;
        if (pairFilter==='odd'  && num%2===0) return false;
      }
      if (typeFilters.length && !typeFilters.some((filter)=>eq.tipo===filter || eq.tipoAnterior===filter)) return false;
      return true;
    });
  },[street.equipment,pairFilter,typeFilters,globalEquipmentFilter,highlightProductId,allocations,forceVisibleEquipmentIds]);

  const visiblePlanogramIds = useMemo(() => {
    const ids = {};
    visibleEquipment.forEach(eq => { if (globalPlanogramMode || planogramEquipment[eq.id]) ids[eq.id] = true; });
    return ids;
  }, [visibleEquipment, planogramEquipment, globalPlanogramMode]);

  const anyVisiblePlanogram = visibleEquipment.some(eq => !!visiblePlanogramIds[eq.id]);
  const allVisiblePlanogram = visibleEquipment.length > 0 && visibleEquipment.every(eq => !!visiblePlanogramIds[eq.id]);

  const toggleEquipmentPlanogram = useCallback((equipId) => {
    setPlanogramEquipment(prev => Object.assign({}, prev, { [equipId]: !prev[equipId] }));
  }, []);

  const toggleStreetPlanogram = useCallback(() => {
    setPlanogramEquipment(prev => {
      const next = Object.assign({}, prev);
      if (visibleEquipment.length && visibleEquipment.every(eq => !!prev[eq.id])) {
        visibleEquipment.forEach(eq => { delete next[eq.id]; });
      } else {
        visibleEquipment.forEach(eq => { next[eq.id] = true; });
      }
      return next;
    });
  }, [visibleEquipment]);

  const handleFillStreet = useCallback(async (levelMode) => {
    if (typeof onFillStreet !== 'function' || fillRunning) return;
    setFillRunning(true);
    setFillStatus('Preenchendo…');
    setFillProgress({ done:0, total:Math.max(visibleEquipment.length, 1), applied:0 });
    try {
      const result = await onFillStreet({
        streetId: street.id,
        equipmentIds: visibleEquipment.map((eq) => eq.id),
        levelMode,
        onProgress: (progress) => {
          const total = Math.max(progress?.total || visibleEquipment.length || 1, 1);
          const done = Math.max(0, Math.min(progress?.done || 0, total));
          let pct = Math.max(0, Math.min(99, Math.round((done / total) * 25)));
          if (progress?.phase === 'calculando') pct = 0;
          if (progress?.phase === 'aplicando') pct = Math.max(40, Math.min(99, Math.round((done / total) * 100)));
          if (progress?.phase === 'concluido') pct = 100;
          const equipmentText = progress?.equipmentId ? ` • ${progress.equipmentId}` : '';
          setFillProgress(Object.assign({}, progress, { done, total, pct }));
          setFillStatus(`${pct}%${equipmentText} • ${progress?.applied || 0} alocado(s)`);
        },
      });
      setFillProgress({ done:result.equipmentDone || visibleEquipment.length || 1, total:visibleEquipment.length || 1, pct:100, applied:result.applied || 0 });
      setFillStatus(`100% • ${result.applied || 0} alocado(s)`);
      window.setTimeout(() => {
        setFillStatus('');
        setFillProgress(null);
      }, 1800);
      setFillOpen(false);
    } catch (error) {
      setFillStatus(String(error).replace(/^Error:\s*/, ''));
    } finally {
      setFillRunning(false);
    }
  }, [fillRunning, onFillStreet, street.id, visibleEquipment]);

  // ── Standardised escaninho size (all equips = geladeira 5-slot reference) ──
  const ESC_LABEL=24, ESC_PAD=8, ESC_GAP=3, REF_ESC=5;
  const escWFixed = Math.floor((colWidth - ESC_LABEL - ESC_PAD*2) / REF_ESC - ESC_GAP);
  const planogramEscW = getPlanogramSlotWidth(escWFixed);
  const effectiveColWidth = useMemo(() => {
    const maxEscs = street.equipment.reduce((m,eq)=>Math.max(m,eq.escsPerNivel), REF_ESC);
    const activeEscW = anyVisiblePlanogram ? planogramEscW : escWFixed;
    return ESC_LABEL + ESC_PAD*2 + maxEscs*(activeEscW + ESC_GAP) + (anyVisiblePlanogram ? 8 : 0);
  },[street.equipment, escWFixed, planogramEscW, anyVisiblePlanogram]);
  const powerGroupsByEquipment = useMemo(() => getPowerGroupsByEquipment(visibleEquipment, allocations), [visibleEquipment, allocations]);

  return (
    <div data-street-id={street.id} style={{ flexShrink:0, minWidth:0, width:isCollapsed?38:effectiveColWidth, maxWidth:isCollapsed?38:effectiveColWidth, height:'100%', overflow:'visible', display:'flex', flexDirection:'column', transition:'width 0.12s, max-width 0.12s' }}>
      <div style={{ background:'var(--shopper-navy)', borderRadius:isCollapsed?'6px':'6px 6px 0 0', padding:isCollapsed?0:'7px 10px', display:'flex', alignItems:'center', flexDirection:'row', gap:5, cursor:'pointer', userSelect:'none', position:'sticky', top:0, zIndex:5, overflow:(filterOpen||fillOpen||menuOpen||newEquipOpen)?'visible':'hidden' }}
        onClick={()=>onToggleStreet()}>
        {isCollapsed ? (
          <div style={{ width:38, height:36, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:13, fontWeight:900, color:'#fff', letterSpacing:'0.04em' }}>{street.id}</span>
          </div>
        ) : (<>
          <div>
            <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.04em' }}>{street.id}</span>

          </div>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.78)', fontWeight:800, fontFamily:'var(--font-numeric)', minWidth:30, textAlign:'right' }}>{stats.pct}%</span>
          <div style={{ width:30, height:3, background:'rgba(255,255,255,0.24)', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${stats.pct}%`, background:stats.pct>=75?'#0DAB77':stats.pct>=40?'#F59C00':'#EF4444', borderRadius:2 }} />
          </div>

          {/* Street planogram */}
          <div style={{ position:'relative', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            <button onClick={globalPlanogramMode ? undefined : toggleStreetPlanogram} disabled={globalPlanogramMode} title={globalPlanogramMode ? 'Planograma da loja ativo' : allVisiblePlanogram ? 'Voltar rua para visão operacional' : 'Ver rua em planograma com fotos'}
              style={{ width:20, height:20,
                background:allVisiblePlanogram?'rgba(18,163,192,0.24)':anyVisiblePlanogram?'rgba(18,163,192,0.14)':'rgba(255,255,255,0.08)',
                border:allVisiblePlanogram||anyVisiblePlanogram?'1px solid rgba(18,163,192,0.58)':'1px solid rgba(255,255,255,0.15)',
                borderRadius:3,
                cursor:globalPlanogramMode?'default':'pointer',
                color:allVisiblePlanogram||anyVisiblePlanogram?'#67E8F9':'rgba(255,255,255,0.55)',
                fontSize:11,
                fontWeight:900,
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                fontFamily:'var(--font-sans)',
                lineHeight:1 }}>
              <EyeIcon size={12} />
            </button>
          </div>

          {/* Fill visible products into this street */}
          <div style={{ position:'relative', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setFillOpen(v=>!v)} title="Preencher esta rua com produtos visíveis da prancheta"
              style={{ width:20, height:20,
                background:fillOpen||fillRunning?'rgba(13,171,119,0.22)':'rgba(255,255,255,0.08)',
                border:fillOpen||fillRunning?'1px solid rgba(13,171,119,0.5)':'1px solid rgba(255,255,255,0.15)',
                borderRadius:3, cursor:fillRunning?'default':'pointer',
                color:fillOpen||fillRunning?'#3DD4A6':'rgba(255,255,255,0.55)',
                fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <FillStreetIcon />
            </button>
            {fillOpen && (<>
              {!fillRunning && <div onClick={()=>setFillOpen(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />}
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:210, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:7, padding:'8px', minWidth:220, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
                <div style={{ padding:'2px 4px 6px', fontSize:9, fontWeight:800, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                  Preencher {street.id}
                </div>
                <div style={{ padding:'0 4px 7px', fontSize:10, color:'var(--map-text-muted)', lineHeight:1.35 }}>
                  Usa produtos visíveis na prancheta e {visibleEquipment.length} equipamento(s) visível(is) desta rua.
                </div>
                <StreetMI label="Todos os níveis" icon="↧" onClick={()=>handleFillStreet('all')} />
                <StreetMI label="Todos menos o mais alto" icon="↓" onClick={()=>handleFillStreet('without_top')} />
                {fillStatus && (
                  <div style={{ margin:'6px 4px 2px', padding:'5px 7px', borderRadius:5, background:'rgba(13,171,119,0.10)', color:'#3DD4A6', fontSize:10, lineHeight:1.35 }}>
                    {fillStatus}
                    {fillProgress && fillRunning && (
                      <div style={{ marginTop:5, height:3, borderRadius:999, background:'rgba(255,255,255,0.16)', overflow:'hidden' }}>
                        <div style={{ width:`${fillProgress.pct || 0}%`, height:'100%', borderRadius:999, background:'#3DD4A6', transition:'width 0.16s ease' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>)}
          </div>

          {/* Filtro compacto */}
          <div style={{ position:'relative', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setFilterOpen(v=>!v)} title="Filtrar equipamentos"
              style={{ width:20, height:20,
                background:(pairFilter!=='all'||typeFilters.length)?'rgba(13,171,119,0.22)':'rgba(255,255,255,0.08)',
                border:(pairFilter!=='all'||typeFilters.length)?'1px solid rgba(13,171,119,0.5)':'1px solid rgba(255,255,255,0.15)',
                borderRadius:3, cursor:'pointer',
                color:(pairFilter!=='all'||typeFilters.length)?'#3DD4A6':'rgba(255,255,255,0.55)',
                fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{display:'block'}}><path d="M1 2h10l-4 5v3l-2-1V7L1 2z" fill="currentColor"/></svg>
            </button>
            {filterOpen && (<>
              <div onClick={()=>setFilterOpen(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:200, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:7, padding:'10px 12px', minWidth:190, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Par / Ímpar</div>
                <div style={{ display:'flex', gap:3, marginBottom:10 }}>
                  {[['all','Todos'],['odd','Ímpares'],['even','Pares']].map(([f,label])=>(
                    <button key={f} onClick={()=>setPairFilter(f)}
                      style={{ padding:'2px 7px', fontSize:9, fontWeight:700, borderRadius:3, cursor:'pointer',
                        border:pairFilter===f?'1px solid rgba(13,171,119,0.5)':'1px solid var(--dropdown-border)',
                        background:pairFilter===f?'rgba(13,171,119,0.12)':'transparent',
                        color:pairFilter===f?'var(--shopper-green)':'var(--dropdown-text)', fontFamily:'var(--font-sans)' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {equipTypes.length > 1 && (<>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Tipo de equipamento</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                    <button onClick={()=>setTypeFilters([])}
                      style={{ padding:'2px 7px', fontSize:9, fontWeight:700, borderRadius:3, cursor:'pointer',
                        border:typeFilters.length===0?'1px solid rgba(13,171,119,0.5)':'1px solid var(--dropdown-border)',
                        background:typeFilters.length===0?'rgba(13,171,119,0.12)':'transparent',
                        color:typeFilters.length===0?'var(--shopper-green)':'var(--dropdown-text)', fontFamily:'var(--font-sans)' }}>
                      Todos
                    </button>
                    {equipTypes.map(t=>{
                      const cfg=getEquipCfg(t);
                      const selected = typeFilters.includes(t);
                      return (
                        <button key={t} onClick={()=>setTypeFilters((current)=>current.includes(t) ? current.filter((item)=>item!==t) : [...current,t])}
                          style={{ padding:'2px 7px', fontSize:9, fontWeight:700, borderRadius:3, cursor:'pointer',
                            border:selected?`1px solid ${cfg.borderColor}`:'1px solid var(--dropdown-border)',
                            background:selected?`${cfg.borderColor}18`:'transparent',
                            color:selected?cfg.color:'var(--dropdown-text)', fontFamily:'var(--font-sans)' }}>
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </>)}
                {(pairFilter!=='all'||typeFilters.length) && (
                  <button onClick={()=>{setPairFilter('all');setTypeFilters([]);}}
                    style={{ marginTop:8, width:'100%', padding:'4px', fontSize:9, fontWeight:700, background:'transparent',
                      border:'1px solid var(--dropdown-border)', borderRadius:3, cursor:'pointer',
                      color:'var(--map-text-muted)', fontFamily:'var(--font-sans)' }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            </>)}
          </div>

          {/* + add equip */}
          <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setNewEquipOpen(v=>!v)} title="Adicionar equipamento"
              style={{ width:20, height:20, background:newEquipOpen?'rgba(13,171,119,0.22)':'rgba(255,255,255,0.08)', border:newEquipOpen?'1px solid rgba(13,171,119,0.5)':'1px solid rgba(255,255,255,0.15)', borderRadius:3, cursor:'pointer', color:newEquipOpen?'#3DD4A6':'rgba(255,255,255,0.55)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              +
            </button>
            {newEquipOpen && (<>
              <div onClick={()=>setNewEquipOpen(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:200, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:8, padding:'10px 12px', minWidth:200, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--map-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:7 }}>Tipo de equipamento</div>
                <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:10 }}>
                  {[
                    ['prateleira','Prateleira'],
                    ['prateleira_pamplona','Prat. Pamplona'],
                    ['geladeira','Geladeira'],
                    ['geladeira_alta','Geladeira Alta'],
                    ['geladeira_gerador','Geladeira Gerador'],
                    ['freezer','Freezer'],
                    ['quimico','Químico'],
                  ].map(([t,label])=>{
                    const cfg=getEquipCfg(t);
                    return (
                      <button key={t} onClick={()=>setNewEquipTipo(t)}
                        style={{ padding:'5px 8px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', textAlign:'left',
                          border:newEquipTipo===t?`1px solid ${cfg.borderColor}`:'1px solid var(--dropdown-border)',
                          background:newEquipTipo===t?`${cfg.borderColor}18`:'transparent',
                          color:newEquipTipo===t?cfg.color:'var(--dropdown-text)', fontFamily:'var(--font-sans)' }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <button onClick={()=>{
                  const mx=Math.max(0,...street.equipment.map(eq=>parseInt(eq.id.split('-')[1]||'0',10)).filter(Number.isFinite));
                  const nextId=`${street.id}-${String(mx+1).padStart(3,'0')}`;
                  setForceVisibleEquipmentIds((current)=>Object.assign({}, current, { [nextId]:true }));
                  dispatch({type:'ADD_EQUIP',streetId:street.id,tipo:newEquipTipo});
                  setNewEquipOpen(false);
                }}
                  style={{ width:'100%', padding:'6px', fontSize:10, fontWeight:700, background:'rgba(13,171,119,0.14)', border:'1px solid rgba(13,171,119,0.4)', borderRadius:5, cursor:'pointer', color:'#0DAB77', fontFamily:'var(--font-sans)' }}>
                  Adicionar ao final de {street.id}
                </button>
              </div>
            </>)}
          </div>

          {/* Street ⋮ menu */}
          <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setMenuOpen(v=>!v)}
              style={{ width:20, height:20, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:3, cursor:'pointer', color:'rgba(255,255,255,0.55)', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ⋮
            </button>
            {menuOpen && (
              <>
                <div onClick={()=>setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />
                <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:200, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:7, padding:4, minWidth:180, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
                  <StreetMI label="Recolher SKUs da rua" icon="↩" onClick={()=>{ onRecolherRua(street.id); setMenuOpen(false); }}/>
                  <StreetMI label="Recolher equipamentos" icon="⊟" onClick={()=>{ dispatch({type:'COLLAPSE_STREET_EQUIPS',streetId:street.id}); setMenuOpen(false); }}/>
                  <StreetMI label="Expandir equipamentos" icon="⊞" onClick={()=>{ dispatch({type:'EXPAND_STREET_EQUIPS',streetId:street.id}); setMenuOpen(false); }}/>
                  <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
                  <StreetMI label="Remover rua" icon="✕" danger onClick={()=>{
                    dispatch({type:'SET_CONFIRM',dialog:{ title:`Remover ${street.id}?`, message:`Remove <strong>${street.id}</strong> e todos os ${street.equipment.length} equipamentos. Não pode ser desfeito.`, requireText:street.id, danger:true, confirmLabel:'Remover rua', onConfirm:()=>dispatch({type:'REMOVE_STREET',streetId:street.id}) }});
                    setMenuOpen(false);
                  }}/>
                </div>
              </>
            )}
          </div>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>&#9660;</span>
        </>)}
      </div>

      {!isCollapsed && (
        <div data-street-body-id={street.id} style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', paddingTop:6, paddingBottom:12 }}>
          {street.equipment.length===0 && (
            <div style={{ padding:'14px 8px', textAlign:'center', color:'var(--map-text-muted)', fontSize:10 }}>
              Nenhum equipamento.<br />
              <button onClick={()=>dispatch({type:'SET_CONFIRM',dialog:{
                title:`Novo equipamento em ${street.id}`,
                message:`Adiciona uma nova <strong>Prateleira</strong> em <strong>${street.id}</strong>.`,
                confirmLabel:'Adicionar',
                onConfirm:()=>dispatch({type:'ADD_EQUIP',streetId:street.id}),
              }})} style={{ marginTop:6, padding:'4px 10px', fontSize:10, fontWeight:700, background:'transparent', border:'1px dashed rgba(148,163,184,0.3)', borderRadius:4, cursor:'pointer', color:'var(--map-text-muted)', fontFamily:'var(--font-sans)' }}>+ Adicionar</button>
            </div>
          )}
          {(pairFilter!=='all'||typeFilters.length||normalizeEquipmentFilterList(globalEquipmentFilter).length) && visibleEquipment.length===0 && street.equipment.length>0 && (
            <div style={{ padding:'10px 8px', textAlign:'center', color:'var(--map-text-muted)', fontSize:10 }}>
              Nenhum equipamento com o filtro ativo.
            </div>
          )}
          {visibleEquipment.map(eq=>(
            <EquipmentCard key={eq.id} eq={eq} streetId={street.id}
              allocations={allocations} hasAllocationSource={hasAllocationSource}
              onEscClick={onEscClick} onHoverEsc={onHoverEsc} onHoverEnd={onHoverEnd}
              isCollapsed={!!equipCollapsed[eq.id]} onToggleCollapse={()=>onToggleEquip(eq.id)}
              colWidth={colWidth} searchQuery={searchQuery} dispatch={dispatch}
              swapSource={swapSource} onStartSwap={onStartSwap} onCompleteSwap={onCompleteSwap}
              highlightProductId={highlightProductId} subcatFilters={subcatFilters}
              escW={escWFixed} pendingEquipmentTypeChanges={pendingEquipmentTypeChanges}
              planogramMode={!!visiblePlanogramIds[eq.id]} onTogglePlanogram={toggleEquipmentPlanogram}
              powerGroup={powerGroupsByEquipment[eq.id] || null}
              verticalLaneLocks={verticalLaneLocks}
              onToggleVerticalLaneLock={onToggleVerticalLaneLock}
              onFillVerticalLane={onFillVerticalLane}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function StreetMI({ label, icon, onClick, danger }) {
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:7, width:'100%', padding:'6px 10px', borderRadius:4, border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-sans)', background:'transparent', color:danger?'#9E1028':'var(--dropdown-text)', fontSize:11, fontWeight:500 }}
      onMouseEnter={e=>e.currentTarget.style.background='var(--dropdown-hover)'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <span style={{ fontSize:12, width:14, textAlign:'center' }}>{icon}</span>{label}
    </button>
  );
}

// ── Map Canvas ─────────────────────────────────────────────────────────────────
function DSEMapCanvas({ mapStructure, allocations, equipCollapsed, streetCollapsed, onToggleEquip, onToggleStreet, onAllocate, onAllocateMany, onAllocateManyProgressive, onCollect, onCollectMany, selectedProduct, mode2aLeva, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, onRecolherRua, onFillStreet, globalEquipmentFilter='all', globalPlanogramMode=false, highlightProductId, subcatFilters=[], queueProductIds=[], pendingEquipmentTypeChanges={} }) {
  const [tooltip, setTooltip] = useState(null);
  const [smartFillProgress, setSmartFillProgress] = useState(null);
  const [verticalLaneLocks, setVerticalLaneLocks] = useState(() => readVerticalLaneLocks());
  const containerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const rafRef = useRef(null);
  const hasAllocationSource = !!selectedProduct || (queueProductIds || []).length > 0;
  const allocatedCountByCode = useMemo(() => {
    const counts = {};
    Object.values(allocations || {}).forEach((alloc) => {
      if (!alloc) return;
      ['p1', 'p2'].forEach((field) => {
        const code = alloc[field];
        if (!code) return;
        counts[code] = (counts[code] || 0) + 1;
      });
    });
    return counts;
  }, [allocations]);
  const capQueueByRequiredBins = useCallback((queue) => {
    const used = {};
    return (queue || []).filter((entryId) => {
      const code = parseBoardEntryCode(entryId);
      if (!code) return false;
      const required = requiredBinsForProductCode(code);
      const alreadyAllocated = allocatedCountByCode[code] || 0;
      const remaining = Math.max(0, required - alreadyAllocated);
      if ((used[code] || 0) >= remaining) return false;
      used[code] = (used[code] || 0) + 1;
      return true;
    });
  }, [allocatedCountByCode]);

  const toggleVerticalLaneLock = useCallback((equipId, pos) => {
    const key = verticalLaneKey(equipId, pos);
    if (!key) return;
    setVerticalLaneLocks((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : current.concat(key);
      writeVerticalLaneLocks(next);
      return next;
    });
  }, []);

  const orderedEscaninhos = useCallback((equipId, level, clickedEscaninhoId, scope) => {
    const parsedClick = parseEscId(clickedEscaninhoId);
    const rows = [];
    mapStructure.forEach((street) => {
      const hasClickedEquip = street.equipment.some((eq) => eq.id === equipId);
      street.equipment.forEach((eq) => {
        if (scope === 'street') {
          if (!hasClickedEquip) return;
        } else if (eq.id !== equipId) {
          return;
        }
        for (let n = 1; n <= eq.niveis; n += 1) {
          if (scope === 'level' && n !== level) continue;
          if ((scope === 'equipment' || scope === 'street') && n < level) continue;
          for (let s = 1; s <= eq.escsPerNivel; s += 1) {
            if (scope !== 'single' && scope !== 'vertical' && isVerticalLaneLockedHelper(eq.id, s, verticalLaneLocks)) continue;
            if (scope === 'vertical' && s !== parsedClick.pos) continue;
            const escaninhoId = `${eq.id}-${n}-${s}`;
            rows.push({ escaninhoId, level:n, pos:s, equipId:eq.id });
          }
        }
      });
    });
    rows.sort((a, b) => {
      if (a.escaninhoId === clickedEscaninhoId) return -1;
      if (b.escaninhoId === clickedEscaninhoId) return 1;
      const aClickedLevel = a.level === parsedClick.level ? 0 : 1;
      const bClickedLevel = b.level === parsedClick.level ? 0 : 1;
      if (aClickedLevel !== bClickedLevel) return aClickedLevel - bClickedLevel;
      if (a.equipId !== b.equipId && scope === 'street') return String(a.equipId).localeCompare(String(b.equipId), 'pt-BR');
      if (a.level !== b.level) return a.level - b.level;
      const aClickedPos = a.pos >= parsedClick.pos ? 0 : 1;
      const bClickedPos = b.pos >= parsedClick.pos ? 0 : 1;
      if (aClickedPos !== bClickedPos) return aClickedPos - bClickedPos;
      return a.pos - b.pos;
    });
    return rows.map((item) => item.escaninhoId);
  }, [mapStructure, verticalLaneLocks]);

  const handleSmartFill = useCallback(async (clickedEscaninhoId, scope, opts={}) => {
    const allowSecondSlot = !!opts.allowSecondSlot;
    const allowClickedTopLevel = !!opts.allowClickedTopLevel;
    const queue = selectedProduct ? [selectedProduct] : capQueueByRequiredBins(queueProductIds || []);
    if (!queue.length) return [];
    const parsed = parseEscId(clickedEscaninhoId);
    const candidateIds = orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, scope || 'equipment');
    const targets = candidateIds.filter((escaninhoId) => {
      const alloc = allocations[escaninhoId] || {};
      if (allowSecondSlot) return !!alloc.p1 && !alloc.p2;
      return !alloc.p1;
    });
    if (!targets.length) return [];

    const codeToEntryIds = {};
    const unallocatedCodes = queue
      .map((productId) => {
        const productCode = parseBoardEntryCode(productId);
        if (!productCode) return '';
        if (!codeToEntryIds[productCode]) codeToEntryIds[productCode] = [];
        codeToEntryIds[productCode].push(productId);
        return productCode;
      })
      .filter(Boolean);

    if (!unallocatedCodes.length) return [];

    const targetGroupsByEquipment = {};
    targets.forEach((escaninhoId) => {
      const parsedTarget = parseEscId(escaninhoId);
      if (!targetGroupsByEquipment[parsedTarget.equipId]) targetGroupsByEquipment[parsedTarget.equipId] = [];
      targetGroupsByEquipment[parsedTarget.equipId].push(escaninhoId);
    });
    const targetGroups = Object.entries(targetGroupsByEquipment).map(([equipmentId, groupTargets]) => ({
      equipmentId,
      targets: groupTargets,
    }));

    const response = await fetch('/api/addressing/fill-street', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unallocated_codes: unallocatedCodes,
        products_data: Object.values(PRODUCT_MAP),
        map_structure: mapStructure,
        allocations,
        target_groups: targetGroups,
        options: {
          allow_top_level: true,
          allow_second_slot: allowSecondSlot,
          allow_clicked_top_level: allowClickedTopLevel,
          whole_street: scope === 'street',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Smart fill falhou com HTTP ${response.status}.`);
    }

    const result = await response.json();
    if (!result || !result.success) {
      throw new Error((result && result.error) || 'Smart fill não retornou sucesso.');
    }

    const targetSet = new Set(targets);
    return (result.moves || [])
      .map((move) => {
        const queueForCode = codeToEntryIds[move.productCode] || [];
        return {
          escaninhoId: move.escaninhoId,
          productId: queueForCode.shift() || move.productCode,
          slot: move.slot || 1,
        };
      })
      .filter((item) => item.productId && targetSet.has(item.escaninhoId));
  }, [allocations, capQueueByRequiredBins, mapStructure, orderedEscaninhos, queueProductIds, selectedProduct]);

  const handleFillVerticalLane = useCallback(async (equipId, pos) => {
    const clickedEscaninhoId = `${equipId}-1-${pos}`;
    const wantsSecondSlot = !!mode2aLeva;
    const queue = selectedProduct ? [selectedProduct] : capQueueByRequiredBins(queueProductIds || []);
    if (!queue.length) {
      setSmartFillProgress({ label:'Selecione um SKU ou deixe produtos visíveis na prancheta.', done:0, total:1, indeterminate:false, error:true });
      window.setTimeout(() => setSmartFillProgress(null), 1600);
      return;
    }
    try {
      setSmartFillProgress({ label:'Calculando alocação da coluna…', done:0, total:1, indeterminate:true });
      const smartBatch = await handleSmartFill(clickedEscaninhoId, 'vertical', { allowSecondSlot:wantsSecondSlot, allowClickedTopLevel:true });
      if (smartBatch && smartBatch.length) {
        if (typeof onAllocateManyProgressive === 'function') {
          setSmartFillProgress({ label:'Aplicando alocação da coluna…', done:0, total:smartBatch.length, indeterminate:false });
          await onAllocateManyProgressive(smartBatch, (done, total) => {
            setSmartFillProgress({ label:'Aplicando alocação da coluna…', done, total, indeterminate:false });
          });
        } else {
          onAllocateMany(smartBatch);
        }
        setSmartFillProgress({ label:'Coluna preenchida.', done:smartBatch.length, total:smartBatch.length, indeterminate:false });
        window.setTimeout(() => setSmartFillProgress(null), 700);
        return;
      }
    } catch (error) {
      console.error('Vertical fill backend error:', error);
    }
    setSmartFillProgress({ label:'Backend não encontrou alocação válida para esta coluna.', done:0, total:1, indeterminate:false, error:true });
    window.setTimeout(() => setSmartFillProgress(null), 1600);
  }, [capQueueByRequiredBins, handleSmartFill, mode2aLeva, onAllocateMany, onAllocateManyProgressive, queueProductIds, selectedProduct]);

  const buildCollectBatch = useCallback((clickedEscaninhoId, scope, slot) => {
    const parsed = parseEscId(clickedEscaninhoId);
    const candidateIds = scope === 'equipment'
      ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'equipment')
      : scope === 'level'
        ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'level')
        : scope === 'street'
          ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'street')
          : [clickedEscaninhoId];
    return candidateIds.filter((escaninhoId) => {
      const alloc = allocations[escaninhoId] || {};
      if (slot === 2) return !!alloc.p2;
      if (slot === 1) return !!alloc.p1;
      return !!alloc.p1 || !!alloc.p2;
    }).map((escaninhoId)=>({ escaninhoId, slot:slot || null }));
  }, [allocations, orderedEscaninhos]);

  // Scroll to highlighted product
  useEffect(()=>{
    if (!highlightProductId || !containerRef.current) return;
    const normalizedHighlight = parseBoardEntryCode(highlightProductId);
    let streetIdx=-1, equipIdx=-1, targetLocationId='', targetStreetId='', targetEquipId='';
    mapStructure.forEach((street,si)=>{
      if (streetIdx>=0) return;
      street.equipment.forEach((eq,ei)=>{
        if (streetIdx>=0) return;
        for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){
          const a=allocations[`${eq.id}-${n}-${s}`];
          if(parseBoardEntryCode(a?.p1)===normalizedHighlight||parseBoardEntryCode(a?.p2)===normalizedHighlight){
            streetIdx=si;
            equipIdx=ei;
            targetLocationId=`${eq.id}-${n}-${s}`;
            targetStreetId=street.id;
            targetEquipId=eq.id;
          }
        }
      });
    });
    if(streetIdx<0) return;
    const container = containerRef.current;
    const centerIn = (scrollEl, target, axis='both') => {
      if (!scrollEl || !target) return;
      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const next = {};
      if (axis === 'both' || axis === 'x') {
        next.left = Math.max(0, scrollEl.scrollLeft + targetRect.left - scrollRect.left - ((scrollEl.clientWidth - targetRect.width) / 2));
      }
      if (axis === 'both' || axis === 'y') {
        next.top = Math.max(0, scrollEl.scrollTop + targetRect.top - scrollRect.top - ((scrollEl.clientHeight - targetRect.height) / 2));
      }
      scrollEl.scrollTo(Object.assign({ behavior:'smooth' }, next));
    };
    const scrollToTarget = () => {
      const target = targetLocationId ? container.querySelector(`[data-location-id="${cssEscapeValue(targetLocationId)}"]`) : null;
      const streetBody = targetStreetId ? container.querySelector(`[data-street-body-id="${cssEscapeValue(targetStreetId)}"]`) : null;
      if (target) {
        centerIn(streetBody, target, 'y');
        centerIn(container, target, 'x');
        return true;
      }
      const equipment = targetEquipId ? container.querySelector(`[data-equipment-id="${cssEscapeValue(targetEquipId)}"]`) : null;
      if (equipment) {
        centerIn(streetBody, equipment, 'y');
        centerIn(container, equipment, 'x');
        return false;
      }
      const streetEl = targetStreetId ? container.querySelector(`[data-street-id="${cssEscapeValue(targetStreetId)}"]`) : null;
      if (streetEl) {
        centerIn(container, streetEl, 'x');
        return false;
      }
      let scrollX=14;
      for(let i=0;i<streetIdx;i++) scrollX += (streetCollapsed[mapStructure[i].id]?38:colWidth)+10;
      let scrollY=0;
      const street=mapStructure[streetIdx];
      for(let i=0;i<equipIdx;i++){
        const eq=street.equipment[i];
        scrollY += equipCollapsed[eq.id] ? 40 : 40 + 14 + eq.niveis*54;
      }
      container.scrollTo({ left:Math.max(0,scrollX-60), top:Math.max(0,scrollY-40), behavior:'smooth' });
      return false;
    };
    const timers = [0,80,180,360,700,1100].map(delay => window.setTimeout(() => {
      window.requestAnimationFrame(scrollToTarget);
    }, delay));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  },[highlightProductId, allocations, mapStructure, streetCollapsed, equipCollapsed, colWidth]);

  const handleEscClick = useCallback(async (escsId,p1,p2,e)=>{
    setTooltip(null);
    const hasCmd = !!(e && (e.metaKey || e.ctrlKey));
    const hasShift = !!(e && e.shiftKey);
    const scope = hasCmd && hasShift ? 'street' : hasCmd ? 'equipment' : hasShift ? 'level' : 'single';
    const wantsSecondSlot = !!(e && e.altKey) || !!mode2aLeva;
    const collectSlot = wantsSecondSlot ? 2 : 1;
    const clicked = parseEscId(escsId);
    const allowClickedTopFill = clicked.level === 1 && (scope === 'equipment' || scope === 'street' || scope === 'level');
    if (!selectedProduct && wantsSecondSlot && p2) {
      const collectBatch = buildCollectBatch(escsId, scope, 2);
      if (collectBatch.length > 1 || scope !== 'single') onCollectMany(collectBatch);
      else onCollectMany([{ escaninhoId:escsId, slot:2 }]);
      return;
    }
    if (p1 && !wantsSecondSlot) {
      const collectBatch = buildCollectBatch(escsId, scope, collectSlot);
      if (collectBatch.length > 1 || scope !== 'single') {
        onCollectMany(collectBatch);
        return;
      }
      onCollect(escsId,p1);
      return;
    }
    if (hasAllocationSource) {
      if (scope === 'single') {
        const directQueue = selectedProduct ? [selectedProduct] : capQueueByRequiredBins(queueProductIds || []);
        const directProductId = directQueue[0];
        if (directProductId) {
          onAllocate(escsId, directProductId, wantsSecondSlot ? 2 : 1);
        }
        return;
      }
      try {
        const scopeLabel = scope === 'street' ? 'rua' : scope === 'level' ? 'nível' : scope === 'equipment' ? 'equipamento' : 'escaninho';
        const levaLabel = wantsSecondSlot ? '2ª leva da ' : '';
        setSmartFillProgress({ label:`Calculando alocação da ${levaLabel}${scopeLabel}…`, done:0, total:1, indeterminate:true });
        const smartBatch = await handleSmartFill(escsId, scope, { allowSecondSlot:wantsSecondSlot, allowClickedTopLevel:allowClickedTopFill });
        if (smartBatch && smartBatch.length) {
          if (typeof onAllocateManyProgressive === 'function') {
            setSmartFillProgress({ label:`Aplicando alocação da ${levaLabel}${scopeLabel}…`, done:0, total:smartBatch.length, indeterminate:false });
            await onAllocateManyProgressive(smartBatch, (done, total) => {
              setSmartFillProgress({ label:`Aplicando alocação da ${levaLabel}${scopeLabel}…`, done, total, indeterminate:false });
            });
          } else {
            onAllocateMany(smartBatch);
          }
          setSmartFillProgress({ label:'Alocação concluída.', done:smartBatch.length, total:smartBatch.length, indeterminate:false });
          window.setTimeout(() => setSmartFillProgress(null), 700);
          return;
        }
      } catch (error) {
        console.error('Smart fill backend error:', error);
      }
      setSmartFillProgress({ label:'Backend não encontrou alocação válida para este escopo.', done:0, total:1, indeterminate:false, error:true });
      window.setTimeout(() => setSmartFillProgress(null), 1800);
      return;
    }
  },[selectedProduct,mode2aLeva,hasAllocationSource,buildCollectBatch,capQueueByRequiredBins,handleSmartFill,onAllocate,onAllocateMany,onAllocateManyProgressive,onCollect,onCollectMany,queueProductIds]);

  const handleHover = useCallback((escsId,p1,p2)=>{
    if(closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if(!p1){setTooltip(null);return;}
    const sourceAddress = SLOT_META?.[escsId]?.cardAddressOriginal || '';
    const product = sourceAddress ? {...p1, cardAddressOriginal:sourceAddress} : p1;
    const product2 = sourceAddress && p2 ? {...p2, cardAddressOriginal:sourceAddress} : p2;
    setTooltip(prev=>prev?.escsId===escsId?prev:{escsId,product,product2,x:0,y:0});
    const c = containerRef.current;
    if(c){
      c.querySelectorAll('.dse-peer-hovered').forEach(el=>el.classList.remove('dse-peer-hovered'));
      c.querySelectorAll(`[data-pid="${p1.id}"]`).forEach(el=>el.classList.add('dse-peer-hovered'));
    }
  },[]);
  const handleHoverEnd = useCallback(()=>{
    closeTimerRef.current = setTimeout(()=>{
      setTooltip(null);
      containerRef.current?.querySelectorAll('.dse-peer-hovered').forEach(el=>el.classList.remove('dse-peer-hovered'));
    }, 350);
  },[]);
  const handleTooltipEnter = useCallback(()=>{
    if(closeTimerRef.current) clearTimeout(closeTimerRef.current);
  },[]);
  const handleTooltipLeave = useCallback(()=>{
    closeTimerRef.current = setTimeout(()=>setTooltip(null), 350);
  },[]);

  return (
    <div ref={containerRef} style={{ flex:1, overflow:'auto', padding:'12px 14px', display:'flex', gap:10, alignItems:'stretch', position:'relative', background:'var(--map-bg)' }}
      onMouseMove={e=>{ if(tooltip&&!rafRef.current){ const cx=e.clientX,cy=e.clientY; rafRef.current=requestAnimationFrame(()=>{ setTooltip(prev=>prev?{...prev,x:cx+14,y:cy-24}:null); rafRef.current=null; }); } }}>

      {smartFillProgress && (
        <div style={{ position:'fixed', top:60, left:'50%', transform:'translateX(-50%)', zIndex:110, minWidth:320, maxWidth:430, background:smartFillProgress.error?'rgba(69,10,10,0.96)':'rgba(16,26,21,0.96)', border:smartFillProgress.error?'1px solid rgba(239,68,68,0.38)':'1px solid rgba(61,212,166,0.28)', borderRadius:12, padding:'10px 12px', color:'#fff', boxShadow:'0 10px 28px rgba(0,0,0,0.28)', pointerEvents:'none' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:6 }}>
            <div style={{ fontSize:11, fontWeight:700 }}>{smartFillProgress.label}</div>
            {!smartFillProgress.indeterminate && (
              <div style={{ fontSize:11, fontWeight:900, color:smartFillProgress.error?'#FCA5A5':'#3DD4A6', fontFamily:'var(--font-numeric)' }}>
                {Math.round((smartFillProgress.done / Math.max(smartFillProgress.total, 1)) * 100)}%
              </div>
            )}
          </div>
          {!smartFillProgress.indeterminate && (
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.72)', marginBottom:6 }}>
              {smartFillProgress.done} de {smartFillProgress.total}
            </div>
          )}
          <div style={{ height:6, background:'rgba(255,255,255,0.12)', borderRadius:999, overflow:'hidden' }}>
            <div style={{
              height:'100%',
              width: smartFillProgress.indeterminate ? '35%' : `${Math.max(4, Math.round((smartFillProgress.done / Math.max(smartFillProgress.total, 1)) * 100))}%`,
              background:smartFillProgress.error?'linear-gradient(90deg, #DC2626, #FCA5A5)':'linear-gradient(90deg, #0DAB77, #3DD4A6)',
              borderRadius:999,
              transition:'width 0.12s ease',
              animation: smartFillProgress.indeterminate ? 'dse-progress-slide 1.15s linear infinite' : 'none',
            }} />
          </div>
        </div>
      )}

      {/* Swap mode banner */}
      {swapSource && (
        <div style={{ position:'fixed', top:60, left:'50%', transform:'translateX(-50%)', zIndex:100, background:'rgba(245,156,0,0.96)', borderRadius:20, padding:'7px 20px', fontSize:11, fontWeight:700, color:'#000', pointerEvents:'none', boxShadow:'0 4px 20px rgba(245,156,0,0.4)' }}>
          ⇄ Clique em outro equipamento para trocar conteúdo · ESC cancela
        </div>
      )}

      {mapStructure.map(street=>(
        <StreetColumn key={street.id} street={street}
          allocations={allocations} hasAllocationSource={hasAllocationSource}
          onEscClick={handleEscClick} onHoverEsc={handleHover} onHoverEnd={handleHoverEnd}
          equipCollapsed={equipCollapsed} onToggleEquip={onToggleEquip}
          isCollapsed={!!streetCollapsed[street.id]} onToggleStreet={()=>onToggleStreet(street.id)}
          colWidth={colWidth} searchQuery={searchQuery} dispatch={dispatch}
          swapSource={swapSource} onStartSwap={onStartSwap} onCompleteSwap={onCompleteSwap}
          highlightProductId={highlightProductId} onRecolherRua={onRecolherRua} onFillStreet={onFillStreet} subcatFilters={subcatFilters}
          globalEquipmentFilter={globalEquipmentFilter}
          globalPlanogramMode={globalPlanogramMode}
          pendingEquipmentTypeChanges={pendingEquipmentTypeChanges}
          verticalLaneLocks={verticalLaneLocks}
          onToggleVerticalLaneLock={toggleVerticalLaneLock}
          onFillVerticalLane={handleFillVerticalLane}
        />
      ))}

      <div style={{ flexShrink:0, paddingTop:6 }}>
        <button onClick={()=>dispatch({type:'SET_CONFIRM',dialog:{
          title:'Nova rua',
          message:'Adiciona uma nova rua vazia ao mapa.',
          confirmLabel:'Adicionar rua',
          onConfirm:()=>dispatch({type:'ADD_STREET'}),
        }})} style={{ width:36, height:46, background:'rgba(0,0,0,0.05)', border:'1px dashed rgba(0,0,0,0.15)', borderRadius:6, cursor:'pointer', color:'rgba(0,0,0,0.25)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }} title="Adicionar rua">+</button>
      </div>

      {tooltip?.product && tooltip.x>0 && (
        <DSEProductTooltip product={tooltip.product} product2={tooltip.product2}
          position={{x:tooltip.x,y:tooltip.y}}
          onClose={()=>{ if(closeTimerRef.current) clearTimeout(closeTimerRef.current); setTooltip(null); }}
          onEdit={()=>{}}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave} />
      )}
    </div>
  );
}

Object.assign(window, { DSEMapCanvas });
