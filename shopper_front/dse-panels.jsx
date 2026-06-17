// DSE Panels — Metrics, Versions, Legend overlay panels
const { useState, useMemo, useEffect } = React;
const { STREETS_STRUCTURE, PRODUCT_MAP } = window.DSEData;
const CURVA_COLOR = window.DSE_CURVA_COLOR;

// ── Shared overlay wrapper ────────────────────────────────────────────────────
function Overlay({ title, onClose, width, children }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingTop:52 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)' }} />
      <div style={{ position:'relative', width, maxWidth:'96vw', height:'calc(100vh - 52px)', display:'flex', flexDirection:'column',
        background:'var(--panel-bg)', borderLeft:'1px solid var(--panel-border)', boxShadow:'-20px 0 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--panel-border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--panel-text)' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--panel-muted)', fontSize:18, lineHeight:1, padding:'2px 6px' }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background:'var(--panel-surface)', border:'1px solid var(--panel-border)', borderRadius:8, padding:'12px 14px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--panel-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color: accent || 'var(--panel-text)', fontFamily:'var(--font-numeric)', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'var(--panel-muted)', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

// ── Curva bar mini chart ──────────────────────────────────────────────────────
function CurvaBar({ distribution }) {
  const [hov, setHov] = useState(null);
  const total = Object.values(distribution).reduce((a,b)=>a+b,0) || 1;
  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', gap:2, height:8, borderRadius:3, overflow:'hidden', width:'100%' }}>
        {['A','B','C','D','E'].map(c => {
          const count = distribution[c] || 0;
          const pct = count / total * 100;
          if (!pct) return null;
          return (
            <div key={c}
              style={{ flex:`0 0 ${pct}%`, background: CURVA_COLOR[c], height:'100%', cursor:'default' }}
              onMouseEnter={() => setHov(c)}
              onMouseLeave={() => setHov(null)}
            />
          );
        })}
      </div>
      {hov && distribution[hov] && (
        <div style={{ position:'absolute', bottom:'calc(100% + 5px)', left:'50%', transform:'translateX(-50%)',
          background:'#0F172A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:5, padding:'4px 9px',
          fontSize:11, fontWeight:700, color: CURVA_COLOR[hov], whiteSpace:'nowrap', zIndex:20,
          pointerEvents:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.4)' }}>
          Curva {hov} · {distribution[hov]} produtos
        </div>
      )}
    </div>
  );
}

// ── METRICS PANEL ─────────────────────────────────────────────────────────────
function DSEMetricsPanel({ allocations, onClose }) {
  const metrics = useMemo(() => {
    let totalSlots = 0, filledSlots = 0;
    const streetStats = {};
    const equipTypeStats = {};
    const allocatedSkus = new Set();

    STREETS_STRUCTURE.forEach(street => {
      let sf = 0, st = 0;
      street.equipment.forEach(eq => {
        const tipo = eq.tipo;
        if (!equipTypeStats[tipo]) equipTypeStats[tipo] = { count:0, empty:0, curvaDist:{}, totalA:0, gerador:0 };
        equipTypeStats[tipo].count++;
        let eqFilled = 0;

        for (let n = 1; n <= eq.niveis; n++) {
          for (let s = 1; s <= eq.escsPerNivel; s++) {
            totalSlots++; st++;
            const key = `${eq.id}-${n}-${s}`;
            const alloc = allocations[key];
            if (alloc?.p1) {
              filledSlots++; sf++; eqFilled++;
              const p = PRODUCT_MAP[alloc.p1];
              if (p) {
                allocatedSkus.add(p.id);
                const c = p.curva || 'E';
                equipTypeStats[tipo].curvaDist[c] = (equipTypeStats[tipo].curvaDist[c]||0)+1;
                if (c==='A') equipTypeStats[tipo].totalA++;
                if (p.degelo==='NÃO') equipTypeStats[tipo].gerador++;
              }
            }
          }
        }
        if (eqFilled === 0) equipTypeStats[tipo].empty++;
      });
      streetStats[street.id] = { filled:sf, total:st, nome:street.nome };
    });

    return { totalSlots, filledSlots, allocatedSkus: allocatedSkus.size, streetStats, equipTypeStats };
  }, [allocations]);

  const fillPct = metrics.totalSlots > 0 ? Math.round(metrics.filledSlots / metrics.totalSlots * 100) : 0;

  const typeLabels = { prateleira:'Prateleiras', prateleira_pamplona:'Prat. Pamplona', geladeira:'Geladeiras', geladeira_alta:'Geladeiras Altas', geladeira_gerador:'Gel. Gerador', freezer:'Freezers', quimico:'Químico' };

  return (
    <Overlay title="Métricas da loja" onClose={onClose} width={400}>
      {/* Overview */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--panel-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Visão geral</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          <StatCard label="Taxa de ocupação" value={`${fillPct}%`}
            sub={`${metrics.filledSlots} / ${metrics.totalSlots} escaninhos`}
            accent={fillPct >= 75 ? '#0DAB77' : fillPct >= 40 ? '#F59E0B' : '#EF4444'} />
          <StatCard label="SKUs alocados" value={metrics.allocatedSkus} />
        </div>
        {/* Fill bar */}
        <div style={{ height:6, background:'var(--panel-border)', borderRadius:3, marginBottom:4 }}>
          <div style={{ height:'100%', width:`${fillPct}%`, background:'var(--shopper-green)', borderRadius:3, transition:'width 0.3s' }} />
        </div>
      </div>

      {/* Per street */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--panel-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Por rua</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {Object.entries(metrics.streetStats).map(([sid, s]) => {
            const pct = s.total > 0 ? Math.round(s.filled/s.total*100) : 0;
            const color = pct >= 75 ? '#0DAB77' : pct >= 40 ? '#F59E0B' : '#EF4444';
            return (
              <div key={sid} style={{ background:'var(--panel-surface)', border:'1px solid var(--panel-border)', borderRadius:7, padding:'9px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--panel-text)' }}>{sid} <span style={{ fontWeight:400, color:'var(--panel-muted)' }}>{s.nome}</span></span>
                  <span style={{ fontSize:12, fontWeight:800, color, fontFamily:'var(--font-numeric)' }}>{pct}%</span>
                </div>
                <div style={{ height:4, background:'var(--panel-border)', borderRadius:2 }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2 }} />
                </div>
                <div style={{ fontSize:9, color:'var(--panel-muted)', marginTop:4 }}>{s.filled} / {s.total} escaninhos</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per equipment type */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--panel-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Por tipo de equipamento</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {Object.entries(metrics.equipTypeStats).map(([tipo, s]) => (
            <div key={tipo} style={{ background:'var(--panel-surface)', border:'1px solid var(--panel-border)', borderRadius:7, padding:'10px 12px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--panel-text)' }}>{typeLabels[tipo]||tipo}</span>
                <span style={{ fontSize:9, color:'var(--panel-muted)' }}>{s.count} equip. · {s.empty} vaz.</span>
              </div>
              <CurvaBar distribution={s.curvaDist} />
              <div style={{ display:'flex', gap:8, marginTop:6, fontSize:9, color:'var(--panel-muted)' }}>
                <span>Curva A: <strong style={{ color:'var(--panel-text)' }}>{s.totalA}</strong></span>
                {tipo.includes('geladeira') && <span>Gerador: <strong style={{ color:'#F59E0B' }}>{s.gerador}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

// ── VERSIONS PANEL ────────────────────────────────────────────────────────────
function formatVersion(version) {
  const versionId = version.version_id || version.id || '';
  const label = version.label || version.nome || versionId;
  const clean = label.replace(/^VERSAO_ENDERECAMENTO__/, '').replace(/__/g, ' ').trim();
  const stamp = String(version.timestamp || '').trim();
  let data = stamp;
  if (stamp && !Number.isNaN(Date.parse(stamp))) {
    data = new Date(stamp).toLocaleString('pt-BR');
  } else if (/^\d{8}_\d{6}$/.test(clean.split(' ')[0] || '')) {
    const parsedStamp = clean.split(' ')[0];
    data = `${parsedStamp.slice(6, 8)}/${parsedStamp.slice(4, 6)}/${parsedStamp.slice(0, 4)} ${parsedStamp.slice(9, 11)}:${parsedStamp.slice(11, 13)}:${parsedStamp.slice(13, 15)}`;
  }
  return {
    id: versionId,
    nome: clean,
    data: data || 'Data indisponível',
  };
}

function DSEVersionsPanel({ onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteText, setDeleteText] = useState('');
  const [deletePendingId, setDeletePendingId] = useState('');
  const [postDeleteNotice, setPostDeleteNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await window.DSEApi.listVersionsAsync();
        if (cancelled) return;
        if (response && response.success) {
          setVersions((response.versions || []).map(formatVersion));
        } else {
          setError((response && response.error) || 'Não foi possível carregar as versões.');
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (v) => {
    if (deleteText.trim().toUpperCase() !== 'CONFIRMAR') return;
    try {
      setDeletePendingId(v.id);
      setError('');
      const response = await window.DSEApi.deleteVersionAsync(v.id);
      if (response && response.success) {
        setVersions(prev => {
          const next = prev.filter(x => x.id !== v.id);
          if (prev.length === 1) {
            setPostDeleteNotice({
              title: 'A única versão foi excluída.',
              message: 'Como essa era a única versão salva, o mapa que está aberto no navegador não é limpo automaticamente. Se quiser ver o mapa vazio agora, recarregue o site. Se salvar sem recarregar, esse estado atual poderá ser salvo novamente como nova versão.',
            });
          } else {
            setPostDeleteNotice(null);
          }
          return next;
        });
        setConfirmDelete(null);
        setDeleteText('');
      } else {
        setError((response && response.error) || 'Não foi possível excluir a versão.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setDeletePendingId('');
    }
  };

  return (
    <Overlay title="Versões salvas" onClose={onClose} width={380}>
      {loading && <div style={{ fontSize:11, color:'var(--panel-muted)' }}>Carregando versões…</div>}
      {error && <div style={{ fontSize:11, color:'#EF4444', marginBottom:12 }}>{error}</div>}
      {postDeleteNotice && (
        <div style={{ marginBottom:12, background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.28)', borderRadius:8, padding:'10px 12px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#B45309', marginBottom:4 }}>{postDeleteNotice.title}</div>
          <div style={{ fontSize:10, color:'#92400E', lineHeight:1.5, marginBottom:8 }}>{postDeleteNotice.message}</div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={()=>window.DSEApi.refreshBootstrap()} style={{ padding:'4px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'#F59E0B', border:'none', color:'#111827' }}>
              Recarregar site
            </button>
            <button onClick={()=>setPostDeleteNotice(null)} style={{ padding:'4px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'transparent', border:'1px solid rgba(146,64,14,0.22)', color:'#92400E' }}>
              OK
            </button>
          </div>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {versions.map(v => (
          <div key={v.id} style={{ background:'var(--panel-surface)', border:'1px solid var(--panel-border)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--panel-text)' }}>{v.nome}</span>
            </div>
            <div style={{ fontSize:10, color:'var(--panel-muted)', marginBottom:8 }}>{v.data}</div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>setConfirmRestore(v)} style={{ padding:'4px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'rgba(13,171,119,0.10)', border:'1px solid rgba(13,171,119,0.3)', color:'var(--shopper-green)' }}>
                Restaurar
              </button>
              <button onClick={()=>{setConfirmDelete(v);setDeleteText('');setPostDeleteNotice(null);}} style={{ padding:'4px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#EF4444' }}>
                Excluir
              </button>
            </div>
            {/* Confirm restore */}
            {confirmRestore?.id===v.id && (
              <div style={{ marginTop:8, background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#F59E0B', marginBottom:6 }}>
                  Isso substituirá o estado atual do mapa. Continuar?
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={async ()=>{
                    try {
                      const response = await window.DSEApi.restoreVersionAsync(v.id);
                      if (response && response.success) {
                        onRestore && onRestore(v);
                        setConfirmRestore(null);
                      } else {
                        setError((response && response.error) || 'Não foi possível restaurar a versão.');
                      }
                    } catch (err) {
                      setError(String(err));
                    }
                  }} style={{ padding:'3px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'#F59E0B', border:'none', color:'#000' }}>Confirmar restauração</button>
                  <button onClick={()=>setConfirmRestore(null)} style={{ padding:'3px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'transparent', border:'1px solid var(--panel-border)', color:'var(--panel-muted)' }}>Cancelar</button>
                </div>
              </div>
            )}
            {/* Confirm delete */}
            {confirmDelete?.id===v.id && (
              <div style={{ marginTop:8, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#EF4444', marginBottom:6 }}>
                  Digite <strong>CONFIRMAR</strong> para excluir a versão. Colar está desabilitado.
                </div>
                <input value={deleteText} onChange={e=>setDeleteText(e.target.value.toUpperCase())} placeholder="CONFIRMAR"
                  onPaste={e=>e.preventDefault()}
                  onKeyDown={e=>{
                    const key = String(e.key || '').toLowerCase();
                    if ((e.metaKey || e.ctrlKey) && key === 'v') e.preventDefault();
                  }}
                  style={{ width:'100%', padding:'4px 8px', fontSize:10, background:'var(--panel-bg)', border:'1px solid var(--panel-border)', borderRadius:4, color:'var(--panel-text)', outline:'none', marginBottom:6 }} />
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>handleDelete(v)} disabled={deleteText.trim().toUpperCase()!=='CONFIRMAR' || deletePendingId===v.id} style={{ padding:'3px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'#EF4444', border:'none', color:'#fff', opacity:deleteText.trim().toUpperCase()==='CONFIRMAR' && deletePendingId!==v.id ? 1 : 0.4 }}>
                    {deletePendingId===v.id ? 'Excluindo…' : 'Excluir'}
                  </button>
                  <button onClick={()=>setConfirmDelete(null)} style={{ padding:'3px 10px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer', fontFamily:'var(--font-sans)', background:'transparent', border:'1px solid var(--panel-border)', color:'var(--panel-muted)' }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && versions.length === 0 && !error && (
          <div style={{ fontSize:11, color:'var(--panel-muted)' }}>Nenhuma versão salva ainda.</div>
        )}
      </div>
    </Overlay>
  );
}

// ── LEGEND PANEL ──────────────────────────────────────────────────────────────
function DSELegendPanel({ onClose }) {
  const equipTypes = [
    ['PRT','Prateleira','#64748B'],['PMP','Prateleira Pamplona','#7C3AED'],
    ['GLD','Geladeira','#2563EB'],['GDA','Geladeira Alta','#1D4ED8'],
    ['GDG','Geladeira de Gerador','#D97706'],['FRZ','Freezer','#0891B2'],['QMC','Químico','#DC2626'],
  ];
  const grupos = Object.entries(window.DSE_GROUP_STYLE).map(([g,s])=>([g,s.text,s.bg]));
  const flags = [
    ['⚠','#EF4444','Produto Químico — crítico'],
    ['⬤','#92400E','Pesado (>5 kg)'],
    ['↑','#F59E0B','Alto (>30 cm)'],
    ['↓','#0891B2','Item pequeno / compacto'],
    ['❄','#38BDF8','Degelo = NÃO'],
    ['!','#F97316','Falta escaninho'],
    ['⇌','#8B5CF6','Em transição / Origem'],
  ];
  const atalhos = [
    ['Clique em vazio','Aloca o produto selecionado ou o próximo da fila filtrada'],
    ['Clique em ocupado','Recolhe produto p/ prancheta'],
    ['Shift + clique vazio','Aloca em todos os vazios do nível'],
    ['Cmd/Ctrl + clique vazio','Aloca em todos os vazios do equipamento'],
    ['Shift + clique ocupado','Recolhe todos do nível'],
    ['Cmd/Ctrl + clique ocupado','Recolhe todos do equipamento'],
    ['Alt + clique','Adiciona como 2º slot'],
    ['Alt + Shift + clique','2º slot em todos do nível'],
    ['Ctrl+Z / Cmd+Z','Desfazer'],
    ['Ctrl+Y / Cmd+Y','Refazer'],
    ['Escape','Fechar sobreposição / cancelar seleção'],
  ];

  const Section = ({ label }) => (
    <div style={{ fontSize:10, fontWeight:700, color:'var(--panel-muted)', textTransform:'uppercase', letterSpacing:'0.07em', margin:'16px 0 8px' }}>{label}</div>
  );
  const Row = ({ children }) => (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px solid var(--panel-border)', fontSize:11 }}>{children}</div>
  );

  return (
    <Overlay title="Legenda e atalhos" onClose={onClose} width={360}>
      <Section label="Tipos de equipamento" />
      {equipTypes.map(([code,label,color])=>(
        <Row key={code}>
          <span style={{ width:36, fontSize:9, fontWeight:800, color, background:`${color}18`, padding:'2px 5px', borderRadius:3, textAlign:'center', flexShrink:0 }}>{code}</span>
          <span style={{ color:'var(--panel-text)' }}>{label}</span>
        </Row>
      ))}

      <Section label="Grupos de produto" />
      {grupos.map(([g,text,bg])=>(
        <Row key={g}>
          <span style={{ width:36, fontSize:9, fontWeight:800, color:text, background:bg, padding:'2px 5px', borderRadius:3, textAlign:'center', flexShrink:0 }}>
            {window.DSE_GROUP_STYLE[g]?.label}
          </span>
          <span style={{ color:'var(--panel-text)' }}>{g}</span>
        </Row>
      ))}

      <Section label="Indicadores de status" />
      {flags.map(([sym,color,label])=>(
        <Row key={label}>
          <span style={{ width:28, textAlign:'center', fontSize:12, color, fontWeight:800, flexShrink:0 }}>{sym}</span>
          <span style={{ color:'var(--panel-text)' }}>{label}</span>
        </Row>
      ))}

      <Section label="Atalhos de teclado" />
      {atalhos.map(([k,v])=>(
        <Row key={k}>
          <span style={{ width:170, fontSize:10, fontFamily:'var(--font-numeric)', color:'var(--panel-muted)', flexShrink:0 }}>{k}</span>
          <span style={{ color:'var(--panel-text)', fontSize:10 }}>{v}</span>
        </Row>
      ))}
    </Overlay>
  );
}

Object.assign(window, { DSEMetricsPanel, DSEVersionsPanel, DSELegendPanel });
