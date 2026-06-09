// DSE Map v3 — Shopper palette, swap contents, recolher rua, highlight + scroll
const { useState, useCallback, useMemo, useRef, useEffect } = React;
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
  quimico:              { label:'Zona Química', short:'QMC', color:'#9E1028', borderColor:'#C41230', headerBgL:'#FBE8EA', headerBgD:'#1A0508' },
  perfumaria:           { label:'Perfumaria',   short:'PRF', color:'#A8155A', borderColor:'#F2749E', headerBgL:'#FBE9F3', headerBgD:'#1A0512' },
};

const ALL_TYPES = Object.entries(EQUIP_CFG).map(([id,cfg])=>({id,...cfg}));

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
function EquipMenu({ eq, streetId, dispatch, onClose, onStartSwap }) {
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
    <div ref={menuRef} onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'100%', right:0, zIndex:200, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:7, padding:4, minWidth:196, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
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
        {item('+ Adicionar após',()=>{
          dispatch({type:'SET_CONFIRM',dialog:{
            title:`Novo equipamento após ${eq.id}`,
            message:`Adiciona uma nova <strong>Prateleira</strong> após <strong>${eq.id}</strong>. O tipo pode ser alterado depois pelo menu ⋮ do equipamento.`,
            confirmLabel:'Adicionar',
            onConfirm:()=>dispatch({type:'ADD_EQUIP',streetId,afterEquipId:eq.id}),
          }});
          onClose();
        },{icon:'+'})}
        <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
        {item('Remover equipamento',()=>setMode('confirmRemove'),{icon:'✕',danger:true})}
      </>)}
    </div>
  );
}

// ── Equipment card ─────────────────────────────────────────────────────────────
function EquipmentCard({ eq, streetId, allocations, selectedProduct, onEscClick, onHoverEsc, onHoverEnd, isCollapsed, onToggleCollapse, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, highlightProductId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovHeader, setHovHeader] = useState(false);
  const cfg = EQUIP_CFG[eq.tipo]||EQUIP_CFG.prateleira;
  const isCard175 = !!eq.card175Only;
  const isDark = document.documentElement.getAttribute('data-dse-theme')==='dark';
  const hdrBg = isCard175
    ? (isDark ? '#1C1200' : '#FFFBEB')
    : (isDark ? cfg.headerBgD : cfg.headerBgL);

  const stats = useMemo(()=>{
    let f=0,t=0;
    for(let n=1;n<=eq.niveis;n++) for(let s=1;s<=eq.escsPerNivel;s++){ t++; if(allocations[`${eq.id}-${n}-${s}`]?.p1) f++; }
    return {filled:f,total:t};
  },[eq,allocations]);

  const dominantCurva = useMemo(()=>getDominantCurva(eq,allocations),[eq,allocations]);

  const isSwapSource   = swapSource === eq.id;
  const isSwapTarget   = swapSource && swapSource !== eq.id;
  const swapBorderColor = isSwapSource ? '#F59C00' : (isSwapTarget ? 'rgba(245,156,0,0.4)' : (isCard175 ? '#D97706' : cfg.borderColor));

  const labelW=24, rowPad=8, gap=3;
  const escW = Math.floor(((colWidth - labelW - rowPad*2 - gap) - gap*(eq.escsPerNivel-1)) / eq.escsPerNivel);

  const handleHeaderClick = () => {
    if (isSwapTarget) { onCompleteSwap(eq.id); return; }
    onToggleCollapse();
  };

  return (
    <div style={{ borderLeft:`4px solid ${swapBorderColor}`, background:'var(--map-equip-bg)', borderRadius:6, overflow:'visible', boxShadow: isSwapSource?`0 0 0 2px #F59C00`:(isCard175?`0 0 0 1px #D97706, 0 2px 10px rgba(217,119,6,0.18)`:'var(--map-equip-shadow)'), marginBottom:6, flexShrink:0, position:'relative', transition:'box-shadow 0.15s' }}>
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

        <span style={{ fontSize:10, fontWeight:800, color:cfg.color, fontFamily:'var(--font-numeric)', letterSpacing:'0.05em', flexShrink:0 }}>{eq.id}</span>
        <span style={{ fontSize:8, fontWeight:700, color:cfg.color, background:`${cfg.borderColor}18`, padding:'1px 5px', borderRadius:10, flexShrink:0, lineHeight:1.8 }}>{cfg.label}</span>
        {isCard175 && (
          <span title="Equipamento presente apenas no Card 175" style={{ fontSize:7, fontWeight:800, color:'#D97706', background:'rgba(217,119,6,0.18)', border:'1px solid rgba(217,119,6,0.35)', padding:'1px 5px', borderRadius:4, flexShrink:0, letterSpacing:'0.06em' }}>C175</span>
        )}

        {/* Swap indicator */}
        {isSwapSource && <span style={{ fontSize:9, fontWeight:700, color:'#F59C00', marginLeft:2 }}>aguardando…</span>}
        {isSwapTarget && <span style={{ fontSize:9, fontWeight:700, color:'#F59C00', opacity:0.7 }}>⇄ trocar</span>}

        <div style={{ flex:1 }} />
        <FillBar filled={stats.filled} total={stats.total} />
        <span style={{ fontSize:10, color:cfg.color, opacity:0.6, flexShrink:0, marginLeft:2 }}>{isCollapsed?'▶':'▼'}</span>

        {(hovHeader||menuOpen) && (
          <div style={{ position:'relative', flexShrink:0, marginLeft:2 }} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();setMenuOpen(v=>!v);}}
              style={{ width:22, height:22, background:menuOpen?`${cfg.borderColor}25`:'transparent', border:`1px solid ${menuOpen?cfg.borderColor:'transparent'}`, borderRadius:4, cursor:'pointer', fontSize:13, color:cfg.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ⋮
            </button>
            {menuOpen && <EquipMenu eq={eq} streetId={streetId} dispatch={dispatch} onClose={()=>{setMenuOpen(false);setHovHeader(false);}} onStartSwap={onStartSwap} />}
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:3 }}>
          {Array.from({length:eq.niveis},(_,ni)=>{
            const nivel=ni+1;
            return (
              <div key={nivel} style={{ display:'flex', alignItems:'center', gap }}>
                <span style={{ width:labelW, fontSize:9, fontWeight:700, color:'var(--map-text-muted)', fontFamily:'var(--font-numeric)', textAlign:'right', paddingRight:4, flexShrink:0 }}>N{nivel}</span>
                {Array.from({length:eq.escsPerNivel},(_,si)=>{
                  const pos=si+1, escsId=`${eq.id}-${nivel}-${pos}`;
                  const alloc=allocations[escsId]||{};
                  const p1=alloc.p1?PRODUCT_MAP[alloc.p1]:null;
                  const p2=alloc.p2?PRODUCT_MAP[alloc.p2]:null;
                  const matchSearch = searchQuery && (p1?.nome?.toLowerCase().includes(searchQuery.toLowerCase())||p1?.id?.toLowerCase().includes(searchQuery.toLowerCase())||p2?.nome?.toLowerCase().includes(searchQuery.toLowerCase()));
                  const isHighlighted = highlightProductId && (p1?.id===highlightProductId||p2?.id===highlightProductId);
                  return (
                    <div key={pos} style={{ width:escW, flexShrink:0, outline:matchSearch?'2px solid #F59C00':isHighlighted?'2px solid #F59C00':'none', borderRadius:5, animation:isHighlighted?'dse-pulse 1.2s ease-in-out 3':'none' }}>
                      <DSEEscaninho escaninhoId={escsId} product1={p1} product2={p2} isEmpty={!p1}
                        isAllocating={!!selectedProduct&&!p1} isHighlighted={isHighlighted}
                        equipCap={eq.cap}
                        onClick={e=>onEscClick(escsId,p1,p2,e)}
                        onHover={(pr1,pr2)=>onHoverEsc(escsId,pr1,pr2)}
                        onHoverEnd={onHoverEnd}
                      />
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
}

// ── Street column ──────────────────────────────────────────────────────────────
function StreetColumn({ street, allocations, selectedProduct, onEscClick, onHoverEsc, onHoverEnd, equipCollapsed, onToggleEquip, isCollapsed, onToggleStreet, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, highlightProductId, onRecolherRua }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
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

  return (
    <div style={{ flexShrink:0, width:colWidth, display:'flex', flexDirection:'column' }}>
      <div style={{ background:'var(--shopper-navy)', borderRadius:'6px 6px 0 0', padding:'7px 10px', display:'flex', alignItems:'center', flexDirection:'row', gap:5, cursor:'pointer', userSelect:'none', position:'sticky', top:0, zIndex:5 }}
        onClick={()=>!menuOpen&&!filterOpen&&onToggleStreet()}>
        <>
          <div>
            <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.04em' }}>{street.id}</span>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.42)', fontWeight:500, marginLeft:5 }}>{street.nome}</span>
          </div>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)', fontFamily:'var(--font-numeric)' }}>{stats.filled}/{stats.total}</span>
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
              ▤
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
          <button onClick={e=>{e.stopPropagation();dispatch({type:'SET_CONFIRM',dialog:{
            title:`Novo equipamento em ${street.id}`,
            message:`Adiciona uma nova <strong>Prateleira</strong> ao final de <strong>${street.id}</strong>. O tipo pode ser alterado depois pelo menu ⋮ do equipamento.`,
            confirmLabel:'Adicionar',
            onConfirm:()=>dispatch({type:'ADD_EQUIP',streetId:street.id}),
          }});}} title="Adicionar equipamento"
            style={{ width:20, height:20, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:3, cursor:'pointer', color:'rgba(255,255,255,0.55)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            +
          </button>

          {/* Street ⋮ menu */}
          <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setMenuOpen(v=>!v)}
              style={{ width:20, height:20, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:3, cursor:'pointer', color:'rgba(255,255,255,0.55)', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ⋮
            </button>
            {menuOpen && (
              <>
                <div onClick={()=>setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />
                <div style={{ position:'absolute', top:'calc(100%+4px)', right:0, zIndex:200, background:'var(--dropdown-bg)', border:'1px solid var(--dropdown-border)', borderRadius:7, padding:4, minWidth:180, boxShadow:'0 10px 30px rgba(0,0,0,0.28)' }}>
                  <StreetMI label="Recolher rua" icon="↩" onClick={()=>{ onRecolherRua(street.id); setMenuOpen(false); }}/>
                  <div style={{ height:1, background:'var(--dropdown-border)', margin:'4px 0' }} />
                  <StreetMI label="Remover rua" icon="✕" danger onClick={()=>{
                    dispatch({type:'SET_CONFIRM',dialog:{ title:`Remover ${street.id}?`, message:`Remove <strong>${street.id}</strong> e todos os ${street.equipment.length} equipamentos. Não pode ser desfeito.`, requireText:street.id, danger:true, confirmLabel:'Remover rua', onConfirm:()=>dispatch({type:'REMOVE_STREET',streetId:street.id}) }});
                    setMenuOpen(false);
                  }}/>
                </div>
              </>
            )}
          </div>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{isCollapsed?'▶':'▼'}</span>
        </>
      </div>

      {!isCollapsed && (
        <div style={{ flex:1, paddingTop:6, paddingBottom:12 }}>
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
              allocations={allocations} selectedProduct={selectedProduct}
              onEscClick={onEscClick} onHoverEsc={onHoverEsc} onHoverEnd={onHoverEnd}
              isCollapsed={!!equipCollapsed[eq.id]} onToggleCollapse={()=>onToggleEquip(eq.id)}
              colWidth={colWidth} searchQuery={searchQuery} dispatch={dispatch}
              swapSource={swapSource} onStartSwap={onStartSwap} onCompleteSwap={onCompleteSwap}
              highlightProductId={highlightProductId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
function DSEMapCanvas({ mapStructure, allocations, equipCollapsed, streetCollapsed, onToggleEquip, onToggleStreet, onAllocate, onCollect, selectedProduct, mode2aLeva, colWidth, searchQuery, dispatch, swapSource, onStartSwap, onCompleteSwap, onRecolherRua, highlightProductId }) {
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);
  const closeTimerRef = useRef(null);

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
    for(let i=0;i<streetIdx;i++) scrollX += (streetCollapsed[mapStructure[i].id]?36:colWidth)+10;
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
    if(selectedProduct){
      if(!p1) onAllocate(escsId,selectedProduct,1);
      else if(mode2aLeva&&!p2) onAllocate(escsId,selectedProduct,2);
      else if(!mode2aLeva) onCollect(escsId,p1);
    } else {
      if(p1) onCollect(escsId,p1);
    }
  },[selectedProduct,mode2aLeva,onAllocate,onCollect]);

  const handleHover = useCallback((escsId,p1,p2)=>{
    if(closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if(!p1){setTooltip(null);return;}
    setTooltip(prev=>prev?.escsId===escsId?prev:{escsId,product:p1,product2:p2,x:0,y:0});
  },[]);
  const handleHoverEnd = useCallback(()=>{
    closeTimerRef.current = setTimeout(()=>setTooltip(null), 350);
  },[]);
  const handleTooltipEnter = useCallback(()=>{
    if(closeTimerRef.current) clearTimeout(closeTimerRef.current);
  },[]);
  const handleTooltipLeave = useCallback(()=>{
    closeTimerRef.current = setTimeout(()=>setTooltip(null), 350);
  },[]);

  return (
    <div ref={containerRef} style={{ flex:1, overflow:'auto', padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start', position:'relative', background:'var(--map-bg)' }}
      onMouseMove={e=>{ if(tooltip) setTooltip(prev=>prev?{...prev,x:e.clientX+14,y:e.clientY-24}:null); }}>

      {/* Swap mode banner */}
      {swapSource && (
        <div style={{ position:'fixed', top:60, left:'50%', transform:'translateX(-50%)', zIndex:100, background:'rgba(245,156,0,0.96)', borderRadius:20, padding:'7px 20px', fontSize:11, fontWeight:700, color:'#000', pointerEvents:'none', boxShadow:'0 4px 20px rgba(245,156,0,0.4)' }}>
          ⇄ Clique em outro equipamento para trocar conteúdo · ESC cancela
        </div>
      )}

      {mapStructure.map(street=>(
        <StreetColumn key={street.id} street={street}
          allocations={allocations} selectedProduct={selectedProduct}
          onEscClick={handleEscClick} onHoverEsc={handleHover} onHoverEnd={handleHoverEnd}
          equipCollapsed={equipCollapsed} onToggleEquip={onToggleEquip}
          isCollapsed={!!streetCollapsed[street.id]} onToggleStreet={()=>onToggleStreet(street.id)}
          colWidth={colWidth} searchQuery={searchQuery} dispatch={dispatch}
          swapSource={swapSource} onStartSwap={onStartSwap} onCompleteSwap={onCompleteSwap}
          highlightProductId={highlightProductId} onRecolherRua={onRecolherRua}
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
