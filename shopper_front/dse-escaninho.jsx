// DSE Escaninho — core visual cell + product tooltip
const { useState, useRef, useEffect, memo } = React;

// ── Color constants ──────────────────────────────────────────────────────────
const CURVA_COLOR = { A:'#0DAB77', B:'#3B82F6', C:'#F59E0B', D:'#F97316', E:'#EF4444' };

const GROUP_STYLE = {
  FLV:        { bg:'rgba(13,171,119,0.13)',  badge:'rgba(13,171,119,0.22)',  text:'#0DAB77', label:'FLV' },
  Alimento:   { bg:'rgba(152,108,60,0.09)',  badge:'rgba(152,108,60,0.20)',  text:'#8B6332', label:'ALM' },
  Bebidas:    { bg:'rgba(59,130,246,0.11)',   badge:'rgba(59,130,246,0.22)',  text:'#2563EB', label:'BEB' },
  Perfumaria: { bg:'rgba(124,58,237,0.11)',  badge:'rgba(124,58,237,0.22)',  text:'#7C3AED', label:'PRF' },
  Químico:    { bg:'rgba(239,68,68,0.13)',   badge:'rgba(239,68,68,0.22)',   text:'#DC2626', label:'QMC' },
  Neutro:     { bg:'rgba(148,163,184,0.09)', badge:'rgba(148,163,184,0.18)', text:'#64748B', label:'NEU' },
};

// ── Flag micro-badges ────────────────────────────────────────────────────────
// Novo esquema de flags — semântica clara, memorizável:
//  ⚠ perigo químico (universal),  ❄ degelo (snowflake = frio, ótimo),
//  ⬤ pesado (bola pesada / massa sólida),  ↑ alto (seta pra cima = altura),
//  ○ pequeno (círculo vazio = leve, compacto),  ◇ frágil (diamante delicado)
const FLAG_DEF = {
  pesado:   { sym:'⬤',  color:'#92400E', title:'Pesado (>5 kg)' },
  alto:     { sym:'↑',  color:'#EF4444', title:'Alto (>30 cm)' },
  pequeno:  { sym:'↓',  color:'#0891B2', title:'Item pequeno / compacto' },
  fragil:   { sym:'◇',  color:'#A855F7', title:'Frágil' },
  degelo:   { sym:'❄',  color:'#38BDF8', title:'Degelo = NÃO' },
  faltaEsc: { sym:'!',  color:'#F97316', title:'Falta escaninho' },
  origem:   { sym:'⇌',  color:'#8B5CF6', title:'Em transição / Origem' },
  volExcede:{ sym:'◉',  color:'#F59E0B', title:'Volume excede capacidade' },
};

function FlagBadge({ type, size = 9 }) {
  const d = FLAG_DEF[type];
  if (!d) return null;
  if (type === 'pesado') return (
    <span title={d.title} style={{ color:d.color, lineHeight:1, flexShrink:0, display:'inline-flex', alignItems:'center' }}>
      <svg width={size} height={size+2} viewBox="0 0 11 13" fill="currentColor">
        {/* Collar disc at top — like the bag-weight reference */}
        <circle cx="5.5" cy="2.1" r="2.0"/>
        {/* Body: narrow at collar top, sweeps wide at bottom */}
        <path d="M 2.1 4.0 L 0.6 11.5 Q 0.5 12.5 1.6 12.5 L 9.4 12.5 Q 10.5 12.5 10.4 11.5 L 8.9 4.0 Z"/>
      </svg>
    </span>
  );
  if (type === 'alto') return (
    <span title={d.title} style={{ color:d.color, lineHeight:1, flexShrink:0, display:'inline-flex', alignItems:'center' }}>
      <svg width={size-1} height={size+5} viewBox="0 0 8 15" fill="none">
        {/* Vertical ruler — de pé */}
        <rect x="1.5" y="0.5" width="5" height="14" rx="0.9" fill="currentColor" opacity="0.2"/>
        <rect x="1.5" y="0.5" width="5" height="14" rx="0.9" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="3.5"  x2="4.8" y2="3.5"  stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="6.5"  x2="3.5" y2="6.5"  stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="9.5"  x2="4.8" y2="9.5"  stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="12.5" x2="3.5" y2="12.5" stroke="currentColor" strokeWidth="0.9"/>
      </svg>
    </span>
  );
  if (type === 'pequeno') return (
    <span title={d.title} style={{ color:d.color, lineHeight:1, flexShrink:0, display:'inline-flex', alignItems:'center' }}>
      <svg width={size-1} height={size+5} viewBox="0 0 8 15" fill="none">
        {/* Vertical ruler — de pé, mesmo tamanho do alto */}
        <rect x="1.5" y="0.5" width="5" height="14" rx="0.9" fill="currentColor" opacity="0.2"/>
        <rect x="1.5" y="0.5" width="5" height="14" rx="0.9" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="3.5"  x2="4.8" y2="3.5"  stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="6.5"  x2="3.5" y2="6.5"  stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="9.5"  x2="4.8" y2="9.5"  stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="12.5" x2="3.5" y2="12.5" stroke="currentColor" strokeWidth="0.9"/>
      </svg>
    </span>
  );
  return (
    <span title={d.title} style={{ fontSize: size, color: d.color, lineHeight:1, fontWeight:800, flexShrink:0 }}>
      {d.sym}
    </span>
  );
}

function getFlags(product) {
  if (!product) return [];
  const flags = [];
  if (product.pesado) flags.push('pesado');
  if (product.alto)   flags.push('alto');
  if (product.pequeno) flags.push('pequeno');
  if (product.degelo === 'NÃO') flags.push('degelo');
  return flags;
}

function escaninhoLabel(escaninhoId) {
  const parts = String(escaninhoId || '').split('-');
  const pos = parseInt(parts.pop() || '', 10);
  const level = parseInt(parts.pop() || '', 10);
  if (!Number.isFinite(level) || !Number.isFinite(pos) || level <= 0 || pos <= 0) return '';
  return `${level}${String.fromCharCode(64 + pos)}`;
}

function AddressBadge({ label, locked }) {
  if (!label) return null;
  return (
    <span style={{
      flexShrink:0,
      fontSize:8,
      fontWeight:900,
      lineHeight:1,
      color:locked?'#B91C1C':'#475569',
      background:locked?'rgba(254,226,226,0.96)':'rgba(255,255,255,0.88)',
      border:`1px solid ${locked?'rgba(239,68,68,0.42)':'rgba(148,163,184,0.28)'}`,
      borderRadius:3,
      padding:'2px 4px',
      fontFamily:'var(--font-numeric)',
      letterSpacing:0,
    }}>
      {label}
    </span>
  );
}

// ── Single product half-cell (used inside slot-duplo) ────────────────────────
function ProductHalf({ product, compact }) {
  if (!product) return null;
  const gs = GROUP_STYLE[product.grupo] || GROUP_STYLE.Neutro;
  const cc = CURVA_COLOR[product.curva] || '#94A3B8';
  const flags = getFlags(product);
  return (
    <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', height:'100%', padding: compact ? '2px 4px' : '3px 5px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:2 }}>
        <span style={{ fontSize:10, fontWeight:800, color:cc, lineHeight:1, flexShrink:0 }}>{product.curva}</span>
        <div style={{ display:'flex', gap:2, alignItems:'center' }}>
          {flags.slice(0,2).map(f => <FlagBadge key={f} type={f} size={8} />)}
        </div>
      </div>
      <div style={{ fontSize:8, color:gs.text, fontWeight:700, lineHeight:1, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
        {product.nome}
      </div>
    </div>
  );
}

// ── Main Escaninho cell ──────────────────────────────────────────────────────
const DSEEscaninho = memo(function DSEEscaninho({ escaninhoId, product1, product2, isEmpty, isSelected, isHighlighted, isAllocating, isLocked=false, equipCap, onClick, onHover, onHoverEnd }) {
  const [hov, setHov] = useState(false);
  const gs1 = product1 ? (GROUP_STYLE[product1.grupo] || GROUP_STYLE.Neutro) : null;
  const gs2 = product2 ? (GROUP_STYLE[product2.grupo] || GROUP_STYLE.Neutro) : null;
  const cc1 = product1 ? (CURVA_COLOR[product1.curva] || '#94A3B8') : null;
  const flags1 = product1 ? getFlags(product1) : [];
  const isChemical = product1?.quimico || product2?.quimico;
  const isDual = product1 && product2;
  const addressLabel = escaninhoLabel(escaninhoId);
  // volExceed removed per feedback

  const emptyStyle = {
    background: isLocked ? 'rgba(254,226,226,0.55)' : (isAllocating ? 'rgba(13,171,119,0.06)' : 'transparent'),
    border: `1px dashed ${isLocked ? 'rgba(220,38,38,0.55)' : (isAllocating ? 'rgba(13,171,119,0.5)' : 'rgba(148,163,184,0.3)')}`,
    cursor: isAllocating ? 'pointer' : 'default',
  };

  const baseStyle = {
    flex: 1, height: 62, borderRadius: 4, position:'relative', overflow:'hidden', flexShrink:0, minWidth:0,
    cursor: onClick ? 'pointer' : 'default', userSelect:'none',
    transition: 'box-shadow 0.12s, border-color 0.12s, transform 0.1s, filter 0.12s',
    filter:isLocked?'saturate(0.45) brightness(0.96)':'none',
  };

  if (isEmpty || !product1) {
    return (
      <div data-location-id={escaninhoId} style={{ ...baseStyle, ...emptyStyle }}
        onClick={e=>onClick&&onClick(escaninhoId,product1,product2,e)} onMouseLeave={onHoverEnd}>
        <div style={{ position:'absolute', top:4, left:4 }}>
          <AddressBadge label={addressLabel} locked={isLocked} />
        </div>
        {isLocked && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', color:'#B91C1C', fontSize:18, fontWeight:900 }}>
            ×
          </div>
        )}
      </div>
    );
  }

  if (isDual) {
    const dualColor = gs1?.text || '#64748B';
    return (
      <div data-pid={product1.id} data-location-id={escaninhoId} style={{ ...baseStyle, '--cc': '#EF4444', background: gs1.bg,
          border: isHighlighted ? '4px solid #DC2626' : `2px solid ${dualColor}`,
          boxShadow: isHighlighted ? '0 0 0 4px rgba(220,38,38,0.35), 0 0 28px rgba(220,38,38,0.50)' : isSelected ? `0 0 0 2px ${cc1}` : hov ? `0 4px 14px ${dualColor}55` : `0 0 6px ${dualColor}33`,
          transform: hov ? 'translateY(-2px) scale(1.03)' : 'scale(1)', zIndex: isHighlighted ? 20 : hov ? 2 : 'auto', animation:isHighlighted?'dse-highlight-pulse 0.75s ease-in-out 8':'none' }}
        onClick={e=>onClick&&onClick(escaninhoId,product1,product2,e)} onMouseEnter={() => { setHov(true); onHover && onHover(escaninhoId, product1, product2); }} onMouseLeave={() => { setHov(false); onHoverEnd && onHoverEnd(); }}>
        {/* Left curva border */}
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background: cc1, borderRadius:'4px 0 0 4px' }} />
        {/* Split layout */}
        <div style={{ display:'flex', flexDirection:'column', height:'100%', paddingLeft:5 }}>
          <div style={{ flex:1, borderBottom:'1px solid rgba(255,255,255,0.15)', overflow:'hidden' }}>
            <ProductHalf product={product1} compact />
          </div>
          <div style={{ flex:1, background: gs2?.bg, overflow:'hidden' }}>
            <ProductHalf product={product2} compact />
          </div>
        </div>
        <div style={{ position:'absolute', top:2, right:2, background:'rgba(255,255,255,0.92)', border:`1px solid ${dualColor}`, borderRadius:3, padding:'1px 4px', lineHeight:1 }} title="Slot duplo — 2 produtos neste escaninho">
          <span style={{ fontSize:8, fontWeight:900, color:dualColor }}>2×</span>
        </div>
        <div style={{ position:'absolute', bottom:2, right:2 }}>
          <AddressBadge label={addressLabel} locked={isLocked} />
        </div>
        {isLocked && <div style={{ position:'absolute', inset:0, border:'2px solid rgba(220,38,38,0.72)', background:'repeating-linear-gradient(135deg, rgba(220,38,38,0.10) 0 6px, transparent 6px 12px)', pointerEvents:'none' }} />}
      </div>
    );
  }

  // Single product
  const flags = flags1;
  return (
    <div data-pid={product1.id} data-location-id={escaninhoId} style={{ ...baseStyle, '--cc': cc1,
        background: gs1.bg,
        border: isHighlighted ? '4px solid #DC2626' : isSelected ? `2px solid ${cc1}` : hov ? `1px solid ${cc1}60` : '1px solid transparent',
        boxShadow: isHighlighted ? '0 0 0 4px rgba(220,38,38,0.35), 0 0 28px rgba(220,38,38,0.50)' : isSelected ? `0 0 0 2px ${cc1}40` : hov ? `0 4px 14px ${cc1}40, 0 0 0 1px ${cc1}50` : 'none',
        transform: hov ? 'translateY(-2px) scale(1.03)' : 'scale(1)', zIndex: isHighlighted ? 20 : hov ? 2 : 'auto', animation:isHighlighted?'dse-highlight-pulse 0.75s ease-in-out 8':'none' }}
      onClick={e=>onClick&&onClick(escaninhoId,product1,product2,e)} onMouseEnter={() => { setHov(true); onHover && onHover(escaninhoId, product1, product2); }} onMouseLeave={() => { setHov(false); onHoverEnd && onHoverEnd(); }}>
      {/* Curva border left */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background: cc1, borderRadius:'4px 0 0 4px' }} />
      <div style={{ paddingLeft:7, paddingRight:4, paddingTop:4, paddingBottom:3, height:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
        {/* Top row: curva + flags */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:2 }}>
          <span style={{ fontSize:11, fontWeight:800, color:cc1, lineHeight:1 }}>{product1.curva}</span>
          <div style={{ display:'flex', gap:2, alignItems:'center', minWidth:0 }}>
            <AddressBadge label={addressLabel} locked={isLocked} />
            {flags.slice(0, 3).map(f => <FlagBadge key={f} type={f} size={9} />)}
          </div>
        </div>
        {/* Group badge */}
        <div style={{ fontSize:8, fontWeight:700, color: gs1.text, lineHeight:1 }}>{gs1.label}</div>
        {/* Product name */}
        <div style={{ fontSize:9.5, color:'var(--map-text)', lineHeight:1.3, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', textOverflow:'ellipsis', fontWeight:500 }}>
          {product1.nome}
        </div>
      </div>
      {isLocked && <div style={{ position:'absolute', inset:0, border:'2px solid rgba(220,38,38,0.72)', background:'repeating-linear-gradient(135deg, rgba(220,38,38,0.10) 0 6px, transparent 6px 12px)', pointerEvents:'none' }} />}
    </div>
  );
}); // end memo(DSEEscaninho)

// ── Product Tooltip ──────────────────────────────────────────────────────────
function DSEProductTooltip({ product, product2, position, onClose, onEdit, onMouseEnter, onMouseLeave }) {
  const tooltipRef = useRef(null);
  const [pos, setPos] = useState(position);

  useEffect(() => {
    if (!tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let { x, y } = position;
    if (x + rect.width + 20 > vw) x = x - rect.width - 16;
    if (y + rect.height + 20 > vh) y = y - rect.height;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setPos({ x, y });
  }, [position]);

  useEffect(() => {
    const handler = (e) => {
      if (tooltipRef.current && tooltipRef.current.contains(e.target)) return;
      onClose && onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);


  const renderProduct = (p, label) => {
    if (!p) return null;
    const gs = GROUP_STYLE[p.grupo] || GROUP_STYLE.Neutro;
    const cc = CURVA_COLOR[p.curva] || '#94A3B8';
    const flags = getFlags(p);
    const volumePerBin = Math.max(0, (Number(p.vol) || 0) * (Number(p.qtd) || 1) / Math.max(1, Number(p.escsNec) || 1));
    const volumePerBinLabel = `${Number(volumePerBin.toFixed(3))} L`;
    const photoUrl = String(p.photoUrl || p.photo_url || p.raw?.photo_url || '').trim();
    const showPhoto = /^https?:\/\//i.test(photoUrl) && !['sem foto', 'n/a', 'na', 'none', 'null', 'nan'].includes(photoUrl.toLowerCase());
    return (
      <div style={{ marginBottom: product2 ? 12 : 0 }}>
        {label && <div style={{ fontSize:9, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{label}</div>}
        {/* Product name */}
        <div style={{ fontSize:14, fontWeight:700, color:'#F1F5F9', marginBottom:8, lineHeight:1.3 }}>{p.nome}</div>
        {showPhoto && (
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}>
            <img
              src={photoUrl}
              alt={p.nome}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{
                display: 'block',
                width: 150,
                maxWidth: '100%',
                maxHeight: 150,
                objectFit: 'contain',
                background: '#fff',
                borderRadius: 8,
                padding: 5,
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
        {/* Curva + group row */}
        <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:800, color:cc, background:`${cc}22`, padding:'2px 7px', borderRadius:4 }}>{p.curva}</span>
          <span style={{ fontSize:10, fontWeight:700, color:gs.text, background:gs.badge, padding:'2px 7px', borderRadius:4 }}>{p.grupo}</span>
          {flags.map(f => <FlagBadge key={f} type={f} size={11} />)}
        </div>
        {/* Data grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px', fontSize:11 }}>
          {[
            ['Armazenagem', p.arm],
            ['Subcategoria', p.sub],
            ['Curva', p.curva],
            ['Método', p.metodo],
            ['Altura', `${p.altura} cm`],
            ['Peso', `${p.peso} kg`],
            ['Vol. escaninho', volumePerBinLabel],
            ['Degelo', p.degelo],
            ['Escs. necessários', p.escsNec],
            ...(p.cardAddressOriginal ? [['Endereço Card 788', p.cardAddressOriginal]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex', flexDirection:'column', gap:1 }}>
              <span style={{ color:'#64748B', fontSize:9, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k}</span>
              <span style={{ color:'#CBD5E1', fontWeight:500 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div ref={tooltipRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={e => e.stopPropagation()} style={{
      position:'fixed', left: pos.x, top: pos.y, zIndex:500,
      background:'#0F172A', border:'1px solid rgba(255,255,255,0.10)', borderRadius:10,
      padding:14, width:260, boxShadow:'0 20px 60px rgba(0,0,0,0.6)',
      pointerEvents:'auto',
    }}>
      {renderProduct(product, product2 ? '1º slot' : null)}
      {product2 && <>
        <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'8px 0' }} />
        {renderProduct(product2, '2º slot')}
      </>}
    </div>
  );
}

// Export color helpers for map use
window.DSE_CURVA_COLOR = CURVA_COLOR;
window.DSE_GROUP_STYLE = GROUP_STYLE;
Object.assign(window, { DSEEscaninho, DSEProductTooltip, DSE_getFlags: getFlags, DSEFlagBadge: FlagBadge, DSE_FLAG_DEF: FLAG_DEF });
