// DSE Map v3 — Shopper palette, swap contents, recolher rua, highlight + scroll
const { useState, useCallback, useMemo, useRef, useEffect, memo } = React;
const { DSEEscaninho, DSEProductTooltip } = window;
const { PRODUCT_MAP } = window.DSEData;
const CURVA_COLOR = window.DSE_CURVA_COLOR;

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

// ── Fill bar ──────────────────────────────────────────────────────────────────
function FillBar({ filled, total }) {
  const pct = total>0 ? Math.round(filled/total*100) : 0;
  const color = pct>=75?'#0DAB77':pct>=40?'#F59C00':'#EF4444';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ width:30, height:3, background:'rgba(0,0,0,0.10)', borderRadius:2 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2, transition:'width 0.2s' }} />
      </div>
      <span style={{ fontSize:9, fontWeight:700, color, minWidth:24, fontFamily:'var(--font-numeric)' }}>{pct}%</span>
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

  const cfg = EQUIP_CFG[eq.tipo]||EQUIP_CFG.prateleira;

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
          <div style={{ fontSize:9, color:'var(--map-text-muted)', marginBottom:8, lineHeight:1.4 }}>Salvar reordena o equipamento pelo número automaticamente.</div>
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
          <div style={{ fontSize:10, color:'var(--map-text-muted)', marginBottom:8, lineHeight:1.5 }}>Remove o equipamento e todos os produtos alocados. Não pode ser desfeito.</div>
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

        <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
        {item('Remover equipamento',()=>setMode('confirmRemove'),{icon:'✕',danger:true})}
      </>)}
    </div>
  );
}

// ── Equipment card ─────────────────────────────────────────────────────────────
const EquipmentCard = memo(function EquipmentCard({ eq, streetId, allocations, hasAllocationSource, onEscClick, onHoverEsc, onHoverEnd, isCollapsed, onToggleCollapse, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, highlightProductId, subcatFilters=[], escW }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({x:0,y:0});
  const menuBtnRef = useRef(null);
  const [hovHeader, setHovHeader] = useState(false);
  const cfg = EQUIP_CFG[eq.tipo]||EQUIP_CFG.prateleira;
  const isCard175 = !!eq.card175Only;
  const isDark = document.documentElement.getAttribute('data-dse-theme')==='dark';
  const hdrBg = isCard175
    ? (isDark ? '#1A0508' : '#FBE8EA')
    : (isDark ? cfg.headerBgD : cfg.headerBgL);

  const stats = useMemo(()=>{
    let f=0,t=0;
    for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){ t++; if(allocations[`${eq.id}-${n}-${s}`]?.p1) f++; }
    return {filled:f,total:t};
  },[eq,allocations]);

  const dominantCurva = useMemo(()=>getDominantCurva(eq,allocations),[eq,allocations]);

  const isSwapSource   = swapSource === eq.id;
  const isSwapTarget   = swapSource && swapSource !== eq.id;
  const swapBorderColor = isSwapSource ? '#F59C00' : (isSwapTarget ? 'rgba(245,156,0,0.4)' : (isCard175 ? '#C41230' : cfg.borderColor));

  const labelW=24, gap=3; // escW is now passed as prop (standardized to geladeira 5-slot size)

  const handleHeaderClick = () => {
    if (isSwapTarget) { onCompleteSwap(eq.id); return; }
    onToggleCollapse();
  };

  return (
    <div style={{ borderLeft: `4px solid ${swapBorderColor}`, background:'var(--map-equip-bg)', borderRadius:6, overflow:'visible', boxShadow: isSwapSource?`0 0 0 2px #F59C00`:(isCard175?`0 0 0 2px #C41230, 0 2px 12px rgba(196,18,48,0.35)`:'var(--map-equip-shadow)'), marginBottom:6, flexShrink:0, position:'relative', transition:'box-shadow 0.15s' }}>
      <div style={{ background:hdrBg, padding:'0 8px', height:34, display:'flex', alignItems:'center', gap:6, cursor:'pointer', userSelect:'none', borderRadius:'2px 5px 0 0', position:'relative' }}
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
        {isCard175 && (
          <span title="Equipamento presente apenas no Card 175" style={{ fontSize:7, fontWeight:800, color:'#C41230', background:'rgba(196,18,48,0.18)', border:'1px solid rgba(196,18,48,0.35)', padding:'1px 5px', borderRadius:4, flexShrink:0, letterSpacing:'0.06em' }}>C175</span>
        )}

        {/* Swap indicator */}
        {isSwapSource && <span style={{ fontSize:9, fontWeight:700, color:'#F59C00', marginLeft:2 }}>aguardando…</span>}
        {isSwapTarget && <span style={{ fontSize:9, fontWeight:700, color:'#F59C00', opacity:0.7 }}>⇄ trocar</span>}

        <div style={{ flex:1 }} />
        <FillBar filled={stats.filled} total={stats.total} />
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
        <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:3 }}>
          {Array.from({length:eq.niveis},(_,ni)=>{
            const nivel=ni+1;
            // Build slot data for this row
            const slots = Array.from({length:eq.escsPerNivel},(_,si)=>{
              const pos=si+1, escsId=`${eq.id}-${nivel}-${pos}`;
              const alloc=allocations[escsId]||{};
              const p1=alloc.p1?PRODUCT_MAP[alloc.p1]:null;
              const p2=alloc.p2?PRODUCT_MAP[alloc.p2]:null;
              return { pos, escsId, alloc, p1, p2, p1id:alloc.p1||null };
            });
            // Group consecutive same-product slots (only filled)
            const runs=[];
            let cur=null;
            for(const slot of slots){
              if(slot.p1id && cur && cur.p1id===slot.p1id){ cur.slots.push(slot); }
              else{ if(cur) runs.push(cur); cur={ p1id:slot.p1id, slots:[slot] }; }
            }
            if(cur) runs.push(cur);
            return (
              <div key={nivel} style={{ display:'flex', alignItems:'center', gap, flexWrap:'nowrap' }}>
                <span style={{ width:labelW, fontSize:9, fontWeight:700, color:'var(--map-text-muted)', fontFamily:'var(--font-numeric)', textAlign:'right', paddingRight:4, flexShrink:0 }}>{nivel}</span>
                {runs.map((run,ri)=>{
                  const isGroup = run.slots.length>1 && run.p1id;
                  const groupColor = isGroup ? (CURVA_COLOR[run.slots[0].p1?.curva]||'#64748B') : null;
                  const subcatActive = subcatFilters.length>0;
                  if(!isGroup){
                    const slot=run.slots[0];
                    const matchSearch=searchQuery&&(slot.p1?.nome?.toLowerCase().includes(searchQuery.toLowerCase())||slot.p1?.id?.toLowerCase().includes(searchQuery.toLowerCase())||slot.p2?.nome?.toLowerCase().includes(searchQuery.toLowerCase()));
                        const isHighlighted=highlightProductId&&(slot.p1?.id===highlightProductId||slot.p2?.id===highlightProductId);
                        const subcatMatch=!subcatActive||(!slot.p1&&!slot.p2)||(slot.p1&&subcatFilters.includes(slot.p1.sub))||(slot.p2&&subcatFilters.includes(slot.p2.sub));
                        return (
                          <div key={ri} style={{ width:escW, flexShrink:0, outline:isHighlighted?'3px solid #EF4444':matchSearch?'2px solid #F59C00':'none', outlineOffset:isHighlighted?'2px':'0px', borderRadius:5, animation:isHighlighted?'dse-highlight-pulse 0.7s ease-in-out 5':'none', opacity:subcatMatch?1:0.25, transition:'opacity 0.15s', position:'relative', zIndex:isHighlighted?5:'auto' }}>
                            <DSEEscaninho escaninhoId={slot.escsId} product1={slot.p1} product2={slot.p2} isEmpty={!slot.p1}
                          isAllocating={hasAllocationSource&&(!slot.p1 || !slot.p2)} isHighlighted={isHighlighted}
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
                  return (
                    <div key={ri} style={{ display:'flex', gap:1, outline:`2px solid ${groupColor}`, borderRadius:6, padding:2, background:`${groupColor}14`, flexShrink:0, position:'relative', opacity:groupSubcatMatch?1:0.25, transition:'opacity 0.15s' }}>
                      {run.slots.map(slot=>{
                        const isHighlighted=highlightProductId&&slot.p1?.id===highlightProductId;
                        return (
                          <div key={slot.pos} style={{ width:escW, flexShrink:0 }}>
                            <DSEEscaninho escaninhoId={slot.escsId} product1={slot.p1} product2={slot.p2} isEmpty={false}
                              isAllocating={false} isHighlighted={isHighlighted}
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
const StreetColumn = memo(function StreetColumn({ street, allocations, hasAllocationSource, onEscClick, onHoverEsc, onHoverEnd, equipCollapsed, onToggleEquip, isCollapsed, onToggleStreet, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, highlightProductId, onRecolherRua, subcatFilters=[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [newEquipTipo, setNewEquipTipo] = useState('prateleira');
  const [newEquipOpen, setNewEquipOpen] = useState(false);
  const [pairFilter, setPairFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const stats = useMemo(()=>{
    let f=0,t=0;
    street.equipment.forEach(eq=>{ for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){ t++; if(allocations[`${eq.id}-${n}-${s}`]?.p1) f++; } });
    return {filled:f,total:t,pct:t>0?Math.round(f/t*100):0};
  },[street,allocations]);

  const equipTypes = useMemo(()=>[...new Set(street.equipment.map(eq=>eq.tipo))],[street.equipment]);

  const visibleEquipment = useMemo(()=>{
    return street.equipment.filter(eq=>{
      if (pairFilter!=='all') {
        const num = parseInt(eq.id.split('-').pop()||'0');
        if (pairFilter==='even' && num%2!==0) return false;
        if (pairFilter==='odd'  && num%2===0) return false;
      }
      if (typeFilter!=='all' && eq.tipo!==typeFilter) return false;
      return true;
    });
  },[street.equipment,pairFilter,typeFilter]);

  // ── Standardised escaninho size (all equips = geladeira 5-slot reference) ──
  const ESC_LABEL=24, ESC_PAD=8, ESC_GAP=3, REF_ESC=5;
  const escWFixed = Math.floor((colWidth - ESC_LABEL - ESC_PAD*2) / REF_ESC - ESC_GAP);
  const effectiveColWidth = useMemo(() => {
    const maxEscs = street.equipment.reduce((m,eq)=>Math.max(m,eq.escsPerNivel), REF_ESC);
    return ESC_LABEL + ESC_PAD*2 + maxEscs*(escWFixed + ESC_GAP);
  },[street.equipment, escWFixed]);

  return (
    <div style={{ flexShrink:0, minWidth:0, width:isCollapsed?38:effectiveColWidth, maxWidth:isCollapsed?38:effectiveColWidth, height:'100%', overflow:'visible', display:'flex', flexDirection:'column', transition:'width 0.12s, max-width 0.12s' }}>
      <div style={{ background:'var(--shopper-navy)', borderRadius:isCollapsed?'6px':'6px 6px 0 0', padding:isCollapsed?0:'7px 10px', display:'flex', alignItems:'center', flexDirection:'row', gap:5, cursor:'pointer', userSelect:'none', position:'sticky', top:0, zIndex:5, overflow:(filterOpen||menuOpen||newEquipOpen)?'visible':'hidden' }}
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
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)', fontFamily:'var(--font-numeric)' }}>{stats.pct}%</span>
          <div style={{ width:22, height:2, background:'rgba(255,255,255,0.15)', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${stats.pct}%`, background:stats.pct>=75?'#0DAB77':stats.pct>=40?'#F59C00':'#EF4444', borderRadius:2 }} />
          </div>

          {/* Filtro compacto */}
          <div style={{ position:'relative', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setFilterOpen(v=>!v)} title="Filtrar equipamentos"
              style={{ width:20, height:20,
                background:(pairFilter!=='all'||typeFilter!=='all')?'rgba(13,171,119,0.22)':'rgba(255,255,255,0.08)',
                border:(pairFilter!=='all'||typeFilter!=='all')?'1px solid rgba(13,171,119,0.5)':'1px solid rgba(255,255,255,0.15)',
                borderRadius:3, cursor:'pointer',
                color:(pairFilter!=='all'||typeFilter!=='all')?'#3DD4A6':'rgba(255,255,255,0.55)',
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
                    <button onClick={()=>setTypeFilter('all')}
                      style={{ padding:'2px 7px', fontSize:9, fontWeight:700, borderRadius:3, cursor:'pointer',
                        border:typeFilter==='all'?'1px solid rgba(13,171,119,0.5)':'1px solid var(--dropdown-border)',
                        background:typeFilter==='all'?'rgba(13,171,119,0.12)':'transparent',
                        color:typeFilter==='all'?'var(--shopper-green)':'var(--dropdown-text)', fontFamily:'var(--font-sans)' }}>
                      Todos
                    </button>
                    {equipTypes.map(t=>{
                      const cfg=EQUIP_CFG[t]||EQUIP_CFG.prateleira;
                      return (
                        <button key={t} onClick={()=>setTypeFilter(t)}
                          style={{ padding:'2px 7px', fontSize:9, fontWeight:700, borderRadius:3, cursor:'pointer',
                            border:typeFilter===t?`1px solid ${cfg.borderColor}`:'1px solid var(--dropdown-border)',
                            background:typeFilter===t?`${cfg.borderColor}18`:'transparent',
                            color:typeFilter===t?cfg.color:'var(--dropdown-text)', fontFamily:'var(--font-sans)' }}>
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </>)}
                {(pairFilter!=='all'||typeFilter!=='all') && (
                  <button onClick={()=>{setPairFilter('all');setTypeFilter('all');}}
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
                    const cfg=EQUIP_CFG[t]||EQUIP_CFG.prateleira;
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
                  const TIPO_DEF={
                    prateleira:{niveis:5,escsPerNivel:7,cap:30.24},
                    prateleira_pamplona:{niveis:3,escsPerNivel:7,cap:30.24,card175Only:true},
                    geladeira:{niveis:4,escsPerNivel:5,cap:20.00},
                    geladeira_alta:{niveis:5,escsPerNivel:3,cap:20.00,card175Only:true},
                    geladeira_gerador:{niveis:4,escsPerNivel:5,cap:20.00},
                    freezer:{niveis:3,escsPerNivel:4,cap:15.00},
                    quimico:{niveis:4,escsPerNivel:7,cap:30.24},
                  };
                  const d=TIPO_DEF[newEquipTipo]||TIPO_DEF.prateleira;
                  dispatch({type:'ADD_EQUIP',streetId:street.id,tipo:newEquipTipo,...d});
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
        <div style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', paddingTop:6, paddingBottom:12 }}>
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
          {(pairFilter!=='all'||typeFilter!=='all') && visibleEquipment.length===0 && street.equipment.length>0 && (
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
              escW={escWFixed}
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
function DSEMapCanvas({ mapStructure, allocations, equipCollapsed, streetCollapsed, onToggleEquip, onToggleStreet, onAllocate, onAllocateMany, onCollect, onCollectMany, selectedProduct, mode2aLeva, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, onRecolherRua, highlightProductId, subcatFilters=[], queueProductIds=[] }) {
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const rafRef = useRef(null);
  const hasAllocationSource = !!selectedProduct || (queueProductIds || []).length > 0;

  const orderedEscaninhos = useCallback((equipId, level, clickedEscaninhoId, scope) => {
    const parsedClick = parseEscId(clickedEscaninhoId);
    const rows = [];
    mapStructure.forEach((street) => {
      street.equipment.forEach((eq) => {
        if (eq.id !== equipId) return;
        for (let n = 1; n <= eq.niveis; n += 1) {
          if (scope === 'level' && n !== level) continue;
          if (scope === 'equipment' && n < level) continue;
          for (let s = 1; s <= eq.escsPerNivel; s += 1) {
            const escaninhoId = `${eq.id}-${n}-${s}`;
            rows.push({ escaninhoId, level:n, pos:s });
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
      if (a.level !== b.level) return a.level - b.level;
      const aClickedPos = a.pos >= parsedClick.pos ? 0 : 1;
      const bClickedPos = b.pos >= parsedClick.pos ? 0 : 1;
      if (aClickedPos !== bClickedPos) return aClickedPos - bClickedPos;
      return a.pos - b.pos;
    });
    return rows.map((item) => item.escaninhoId);
  }, [mapStructure]);

  // Score a slot for a specific product based on tipo_fisico rules from agent_scoring.py
  const scoreSlotForProduct = useCallback((escaninhoId, productId) => {
    const { level, equipId } = parseEscId(escaninhoId);
    const product = PRODUCT_MAP[productId];
    if (!product) return -level * 2;
    let eq = null;
    for (const street of mapStructure) {
      for (const e of street.equipment) { if (e.id === equipId) { eq = e; break; } }
      if (eq) break;
    }
    const isPrateleira = eq && (eq.tipo || '').includes('prateleira');
    if (!isPrateleira) return -level * 2;
    const niveis = eq ? eq.niveis : 5;
    let score = 0;
    // pesado: bloqueia topo, prefere níveis 3-4
    if (product.pesado) {
      if (level === 1) return -99999;
      if (level === 4) score += 70;
      else if (level === 3) score += 50;
      else if (level === 2) score += 10;
    }
    // FLV em prateleira: bloqueia nível 1 e último nível
    if ((product.grupo || '').toUpperCase() === 'FLV') {
      if (level === 1 || level === niveis) return -99999;
      score += 30;
    }
    // frágil/alto: prefere topo (nível 1)
    if (product.fragil || product.alto) {
      score += (niveis - level) * 12;
    }
    // pequeno: prefere níveis mais baixos
    if (product.pequeno) {
      score += level * 6;
    }
    score -= level * 2;
    return score;
  }, [mapStructure]);

  const buildAllocationBatch = useCallback((clickedEscaninhoId, opts) => {
    const queue = selectedProduct ? [selectedProduct] : (queueProductIds || []);
    if (!queue.length) return [];
    const parsed = parseEscId(clickedEscaninhoId);
    const scope = opts.scope || 'single';
    const slot = opts.slot || 1;
    const candidateIds = scope === 'equipment'
      ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'equipment')
      : scope === 'level'
        ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'level')
        : [clickedEscaninhoId];
    const targets = candidateIds.filter((escaninhoId) => {
      const alloc = allocations[escaninhoId] || {};
      if (slot === 2) return !!alloc.p1 && !alloc.p2;
      return !alloc.p1;
    });
    // Single product: sort slots by score for this product
    if (selectedProduct) {
      const sorted = [...targets].sort((a, b) => scoreSlotForProduct(b, selectedProduct) - scoreSlotForProduct(a, selectedProduct));
      return sorted.slice(0, 1).map((escaninhoId) => ({ escaninhoId, productId: selectedProduct, slot }));
    }
    // Queue: greedy match — each product picks its best available slot
    if (scope === 'equipment' && queue.length > 1) {
      const used = new Set();
      const result = [];
      for (const productId of queue) {
        if (result.length >= queue.length) break;
        const best = [...targets]
          .filter((s) => !used.has(s))
          .sort((a, b) => scoreSlotForProduct(b, productId) - scoreSlotForProduct(a, productId))[0];
        if (best && productId) { used.add(best); result.push({ escaninhoId: best, productId, slot }); }
      }
      return result.filter((item) => !!item.productId);
    }
    return targets.slice(0, queue.length).map((escaninhoId, index) => ({
      escaninhoId,
      productId: queue[index],
      slot,
    })).filter((item) => !!item.productId);
  }, [allocations, orderedEscaninhos, queueProductIds, selectedProduct, scoreSlotForProduct]);

  const buildCollectBatch = useCallback((clickedEscaninhoId, scope) => {
    const parsed = parseEscId(clickedEscaninhoId);
    const candidateIds = scope === 'equipment'
      ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'equipment')
      : scope === 'level'
        ? orderedEscaninhos(parsed.equipId, parsed.level, clickedEscaninhoId, 'level')
        : [clickedEscaninhoId];
    return candidateIds.filter((escaninhoId) => {
      const alloc = allocations[escaninhoId] || {};
      return !!alloc.p1;
    });
  }, [allocations, orderedEscaninhos]);

  // Scroll to highlighted product
  useEffect(()=>{
    if (!highlightProductId || !containerRef.current) return;
    let streetIdx=-1, equipIdx=-1;
    mapStructure.forEach((street,si)=>{
      if (streetIdx>=0) return;
      street.equipment.forEach((eq,ei)=>{
        if (streetIdx>=0) return;
        for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){
          const a=allocations[`${eq.id}-${n}-${s}`];
          if(a?.p1===highlightProductId||a?.p2===highlightProductId){ streetIdx=si; equipIdx=ei; }
        }
      });
    });
    if(streetIdx<0) return;
    let scrollX=14;
    for(let i=0;i<streetIdx;i++) scrollX += (streetCollapsed[mapStructure[i].id]?38:colWidth)+10;
    let scrollY=0;
    const street=mapStructure[streetIdx];
    for(let i=0;i<equipIdx;i++){
      const eq=street.equipment[i];
      scrollY += equipCollapsed[eq.id] ? 40 : 40 + 14 + eq.niveis*54;
    }
    containerRef.current.scrollLeft = Math.max(0,scrollX-60);
    containerRef.current.scrollTop  = Math.max(0,scrollY-40);
  },[highlightProductId]);

  const handleEscClick = useCallback((escsId,p1,p2,e)=>{
    setTooltip(null);
    const scope = (e && (e.metaKey || e.ctrlKey)) ? 'equipment' : (e && e.shiftKey) ? 'level' : 'single';
    const wantsSecondSlot = !!(e && e.altKey) || !!mode2aLeva;
    if (hasAllocationSource) {
      const allocationBatch = buildAllocationBatch(escsId, { scope, slot:wantsSecondSlot ? 2 : 1 });
      if (allocationBatch.length > 1) {
        onAllocateMany(allocationBatch);
        return;
      }
      if (allocationBatch.length === 1) {
        const item = allocationBatch[0];
        onAllocate(item.escaninhoId, item.productId, item.slot);
        return;
      }
    }
    if (p1) {
      const collectBatch = buildCollectBatch(escsId, scope);
      if (collectBatch.length > 1) {
        onCollectMany(collectBatch);
        return;
      }
      if (!wantsSecondSlot && p1) onCollect(escsId,p1);
      return;
    }
    if(selectedProduct){
      if(!p1) onAllocate(escsId,selectedProduct,1);
      else if(wantsSecondSlot&&!p2) onAllocate(escsId,selectedProduct,2);
    } else {
      if(p1) onCollect(escsId,p1);
    }
  },[selectedProduct,mode2aLeva,hasAllocationSource,buildAllocationBatch,buildCollectBatch,onAllocate,onAllocateMany,onCollect,onCollectMany]);

  const handleHover = useCallback((escsId,p1,p2)=>{
    if(closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if(!p1){setTooltip(null);return;}
    setTooltip(prev=>prev?.escsId===escsId?prev:{escsId,product:p1,product2:p2,x:0,y:0});
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
    <div ref={containerRef} style={{ flex:1, overflowX:'auto', overflowY:'hidden', padding:'12px 14px', display:'flex', gap:10, alignItems:'stretch', position:'relative', background:'var(--map-bg)' }}
      onMouseMove={e=>{ if(tooltip&&!rafRef.current){ const cx=e.clientX,cy=e.clientY; rafRef.current=requestAnimationFrame(()=>{ setTooltip(prev=>prev?{...prev,x:cx+14,y:cy-24}:null); rafRef.current=null; }); } }}>

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
          highlightProductId={highlightProductId} onRecolherRua={onRecolherRua} subcatFilters={subcatFilters}
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
