// DSE Config Panel — Fluxo 1 (nova loja) + Fluxo 2 (Card 175) + logs
const { useState, useEffect, useRef } = React;
const { STORES, METABASE_SALES } = window.DSEData;

// ── Log item visual ──────────────────────────────────────────────────────────
function LogItem({ entry }) {
  const colorMap = { success: '#0DAB77', error: '#EF4444', info: '#94A3B8', warn: '#F59E0B' };
  const color = colorMap[entry.type] || colorMap.info;
  return (
    <div style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid var(--cfg-border)', fontSize:11, lineHeight:1.45, fontFamily:'var(--font-numeric)' }}>
      <span style={{ color, flexShrink:0, marginTop:1, fontWeight:700 }}>
        {entry.type === 'success' ? '✓' : entry.type === 'error' ? '✕' : entry.type === 'warn' ? '⚠' : '·'}
      </span>
      <span style={{ color:'var(--cfg-text-muted)', flexShrink:0 }}>{entry.ts}</span>
      <span style={{ color:'var(--cfg-text)', flex:1, wordBreak:'break-word' }} dangerouslySetInnerHTML={{ __html: entry.msg }} />
    </div>
  );
}

// ── ETL Alert card ───────────────────────────────────────────────────────────
function AlertCard({ alert, onSend, onRefresh, sending, refreshing }) {
  const disableActions = !!sending || !!refreshing;
  return (
    <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:6, padding:'8px 10px', marginBottom:6 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#EF4444' }}>{alert.titulo}</span>
        <span style={{ fontSize:10, color:'#EF4444', background:'rgba(239,68,68,0.15)', padding:'1px 6px', borderRadius:10 }}>{alert.count} itens</span>
      </div>
      <div style={{ fontSize:10, color:'var(--cfg-text-muted)', marginBottom:6 }}>
        {alert.exemplos.slice(0,2).map((e,i) => <div key={i}>{e.codigo} — {e.nome}</div>)}
        {alert.exemplos.length > 2 && <div style={{ color:'#94A3B8' }}>+ {alert.exemplos.length - 2} mais…</div>}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <button disabled={disableActions} onClick={() => onSend(alert)} style={smallBtnStyle('rgba(13,171,119,0.10)','rgba(13,171,119,0.32)','var(--shopper-green)', disableActions)}>{sending ? 'Enviando…' : 'Enviar p/ ETL'}</button>
        <button disabled={disableActions} onClick={() => onRefresh(alert)} style={smallBtnStyle('rgba(59,130,246,0.10)','rgba(59,130,246,0.28)','#2563EB', disableActions)}>{refreshing ? 'Atualizando…' : '↻ Refresh'}</button>
      </div>
    </div>
  );
}

function smallBtnStyle(bg, border, color, disabled) {
  return { background: bg, border: `1px solid ${border}`, color, fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:4, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily:'var(--font-sans)' };
}

function normalizeEtlAlerts(warnings) {
  return (warnings || []).map(function (warning, index) {
    return {
      id: String(warning.type || ('warning-' + index)),
      titulo: String(warning.title || warning.type || 'Alerta ETL'),
      count: Number(warning.count || 0),
      exemplos: (warning.examples || []).map(function (item) {
        return {
          codigo: String(item.product_code || item.codigo || ''),
          nome: String(item.product_name || item.nome || ''),
        };
      }),
      raw: warning,
    };
  });
}

function summarizeEtlWarnings(warnings) {
  if (!warnings || warnings.length === 0) return 'Nenhum aviso crítico retornado pelo ETL.';
  return warnings.map(function (warning) {
    return String(warning.count || 0) + ' ' + String(warning.title || warning.type || 'alerta');
  }).join(' · ');
}

// ── Store checkboxes ─────────────────────────────────────────────────────────
function StoreCheckboxes({ selected, onChange }) {
  const toggle = (id) => onChange(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px', marginTop:6 }}>
      {STORES.map(s => (
        <label key={s.id} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--cfg-text)', cursor:'pointer' }}>
          <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
            style={{ accentColor:'var(--shopper-green)', width:12, height:12 }} />
          {s.nome}
        </label>
      ))}
    </div>
  );
}

// ── Field ────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, monospace }) {
  return (
    <div style={{ marginBottom:8 }}>
      <label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'https://docs.google.com/spreadsheets/…'}
        style={{ width:'100%', padding:'6px 10px', fontSize:11, fontFamily: monospace ? 'var(--font-numeric)' : 'var(--font-sans)',
          background:'var(--cfg-input-bg)', border:'1px solid var(--cfg-border)', borderRadius:5, color:'var(--cfg-text)', outline:'none' }}
      />
    </div>
  );
}

// ── Primary action button ────────────────────────────────────────────────────
function CfgBtn({ label, onClick, primary, disabled, loading }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:6, cursor: disabled || loading ? 'default' : 'pointer',
        border: primary ? 'none' : '1px solid var(--cfg-border)',
        background: primary ? 'var(--shopper-green)' : 'var(--cfg-input-bg)',
        color: primary ? '#fff' : 'var(--cfg-text)',
        opacity: disabled || loading ? 0.5 : 1,
        fontFamily:'var(--font-sans)', display:'flex', alignItems:'center', gap:5 }}>
      {loading && <span style={{ display:'inline-block', width:8, height:8, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'dse-spin 0.7s linear infinite' }}></span>}
      {label}
    </button>
  );
}

// ── Main ConfigPanel ─────────────────────────────────────────────────────────
function DSEConfigPanel({ onOpenMap, asOverlay, onClose, selectedStore, onStoreChange }) {
  const [flow, setFlow] = useState(1);
  const workflow = window.DSEBootstrap.WORKFLOW || {};
  const [links, setLinks] = useState({
    ender: (workflow.target && (workflow.target.url || workflow.target.sheet_id)) || '',
    etl: (workflow.master && (workflow.master.url || workflow.master.sheet_id)) || '',
    mix: (workflow.mix && (workflow.mix.url || workflow.mix.sheet_id)) || '',
    mapaEq: (workflow.target && (workflow.target.url || workflow.target.sheet_id)) || '',
  });
  const [loja, setLoja] = useState('');
  const [dates, setDates] = useState({
    ini: (METABASE_SALES && METABASE_SALES.data_inicial) || new Date().toISOString().slice(0,10),
    fim: (METABASE_SALES && METABASE_SALES.data_final)   || new Date().toISOString().slice(0,10),
  });
  const [lojas, setLojas] = useState([]);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(null); // { val: 0-100, label: '' }
  const [status, setStatus] = useState({ msg:'Aguardando configuração.', type:'info' });
  const [running, setRunning] = useState(null); // which action is running
  const [alerts, setAlerts] = useState([]);
  const [alertAction, setAlertAction] = useState(null); // { id, mode }
  const [autoOpen, setAutoOpen] = useState(false);
  const logsEndRef = useRef(null);
  const runningProgressTimerRef = useRef(null);

  const now = () => new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  const addLog = (msg, type = 'info') => setLogs(l => [...l, { msg, type, ts: now() }]);
  const setStatusMsg = (msg, type = 'info') => setStatus({ msg, type });

  useEffect(() => {
    if (logsEndRef.current) {
      const el = logsEndRef.current;
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }, [logs]);

  useEffect(() => () => {
    if (runningProgressTimerRef.current) clearInterval(runningProgressTimerRef.current);
  }, []);

  const stopRunningProgress = () => {
    if (runningProgressTimerRef.current) {
      clearInterval(runningProgressTimerRef.current);
      runningProgressTimerRef.current = null;
    }
  };

  const startRunningProgress = (startVal, label, maxVal) => {
    stopRunningProgress();
    setProgress({ val:startVal, label });
    runningProgressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        if (!prev) return { val:startVal, label };
        if (prev.val >= maxVal) return prev;
        var nextVal = prev.val < 55 ? prev.val + 7 : prev.val + 3;
        return { val: Math.min(maxVal, nextVal), label: prev.label || label };
      });
    }, 900);
  };

  const pollJobResult = async (jobId, handlers) => {
    return await new Promise((resolve, reject) => {
      const iv = setInterval(async () => {
        try {
          const r = await fetch('/api/jobs/' + jobId);
          const job = await r.json();
          if (job.status === 'done') {
            clearInterval(iv);
            resolve(job.result || {});
            return;
          }
          if (job.status === 'failed') {
            clearInterval(iv);
            reject(new Error(job.error || 'Job falhou.'));
            return;
          }
          if (handlers && typeof handlers.onUpdate === 'function') {
            handlers.onUpdate(job);
          }
        } catch (e) {
          clearInterval(iv);
          reject(e);
        }
      }, handlers && handlers.intervalMs ? handlers.intervalMs : 1800);
    });
  };

  const applyRefreshedAlert = (warningPayload) => {
    if (!warningPayload || !warningPayload.warning) return;
    const normalized = normalizeEtlAlerts([warningPayload.warning])[0];
    if (!normalized) return;
    setAlerts(prev => {
      if (warningPayload.resolved || normalized.count <= 0) {
        return prev.filter(function (item) { return item.id !== normalized.id; });
      }
      const exists = prev.some(function (item) { return item.id === normalized.id; });
      if (!exists) return prev.concat([normalized]);
      return prev.map(function (item) { return item.id === normalized.id ? normalized : item; });
    });
  };

  const handleRefreshAlert = async (alert) => {
    const warningType = String(alert && alert.raw && alert.raw.type || '');
    if (!warningType) return;
    setAlertAction({ id: alert.id, mode: 'refresh' });
    setProgress({ val:20, label:'Atualizando alerta ETL…' });
    addLog(`Atualizando alerta "${alert.titulo}"…`, 'info');
    try {
      const result = await window.DSEApi.refreshEtlWarningAsync(warningType);
      if (!result || !result.success) {
        throw new Error((result && result.error) || 'Falha ao atualizar alerta ETL.');
      }
      applyRefreshedAlert(result);
      if (result.resolved || !result.warning || Number(result.warning.count || 0) <= 0) {
        addLog(`Alerta "${alert.titulo}" resolvido.`, 'success');
      } else {
        addLog(`Alerta "${alert.titulo}" atualizado: ${result.warning.count || 0} item(ns) ainda pendente(s).`, 'warn');
      }
      setStatusMsg('Alerta ETL atualizado.', 'success');
      setProgress({ val:100, label:'Alerta atualizado.' });
    } catch (err) {
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setAlertAction(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const handleSendAlert = async (alert) => {
    const warningType = String(alert && alert.raw && alert.raw.type || '');
    if (!warningType) return;
    setAlertAction({ id: alert.id, mode: 'send' });
    setProgress({ val:12, label:'Enfileirando envio do alerta…' });
    addLog(`Enviando grupo "${alert.titulo}" para o ETL…`, 'info');
    try {
      const response = await window.DSEApi.sendEtlWarningGroupAsync(warningType);
      if (!response || (!response.success && !response.job_id)) {
        throw new Error((response && response.error) || 'Falha ao enviar grupo do alerta para o ETL.');
      }
      const jobId = response.job_id;
      if (!jobId) {
        throw new Error('Job de envio do alerta não retornou identificador.');
      }
      startRunningProgress(24, 'Montando grupo e escrevendo na planilha ETL…', 90);
      const result = await pollJobResult(jobId, {
        intervalMs: 1600,
        onUpdate: function (job) {
          if (job.status === 'pending') {
            setProgress({ val:18, label:'Job de envio do alerta enfileirado…' });
          } else if (job.status === 'running' && job.result && job.result.progress_pct) {
            setProgress({
              val: Math.max(28, Math.min(95, Number(job.result.progress_pct) || 28)),
              label: job.result.progress_label || 'Enviando grupo para a planilha ETL…',
            });
          }
        },
      });
      stopRunningProgress();
      if (!result || !result.success) {
        throw new Error((result && result.error) || 'Falha ao enviar grupo do alerta para o ETL.');
      }
      setProgress({ val:100, label:'Grupo enviado para o ETL.' });
      addLog(`Grupo "${alert.titulo}" enviado: ${result.queued_count || 0} item(ns), ${result.inserted_count || 0} inserido(s), ${result.already_present_count || 0} já existia(m).`, 'success');
      if (result.target_sheet_url) {
        addLog(`Destino: <a href="${result.target_sheet_url}" target="_blank" style="color:var(--shopper-green);text-decoration:underline">${result.target_sheet || 'Aba ETL'}</a>.`, 'info');
      }
      const refreshed = await window.DSEApi.refreshEtlWarningAsync(warningType);
      if (refreshed && refreshed.success) {
        applyRefreshedAlert(refreshed);
        if (refreshed.resolved || !refreshed.warning || Number(refreshed.warning.count || 0) <= 0) {
          addLog(`Alerta "${alert.titulo}" resolvido após o envio.`, 'success');
        } else {
          addLog(`Alerta "${alert.titulo}" ainda possui ${refreshed.warning.count || 0} item(ns) pendente(s) após o envio.`, 'warn');
        }
      }
      setStatusMsg('Grupo enviado para o ETL.', 'success');
    } catch (err) {
      stopRunningProgress();
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setAlertAction(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const handleSaveLinks = async () => {
    if (!links.etl || !links.mix) { setStatusMsg('Erro: links obrigatórios faltando.', 'error'); addLog('Erro: preencha todos os links antes de salvar.', 'error'); return; }
    setRunning('save');
    setProgress({ val:25, label:'Conectando planilhas…' });
    addLog('Conectando Endereçamento, ETL e Mix…', 'info');
    await new Promise(r => setTimeout(r, 0));
    try {
      const target = flow === 1 ? links.ender : links.mapaEq;
      const response = window.DSEApi.connectWorkflowSheets(target, links.etl, links.mix);
      if (response && response.success) {
        setProgress({ val:100, label:'Links salvos com sucesso.' });
        addLog('Links salvos com sucesso.', 'success');
        setStatusMsg('Links salvos com sucesso.', 'success');
      } else {
        throw new Error((response && response.error) || 'Não foi possível conectar as planilhas.');
      }
    } catch (err) {
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setRunning(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const handleETL = async () => {
    setRunning('etl');
    setAlerts([]);
    setProgress({ val:12, label:'Enfileirando ETL…' });
    addLog('Iniciando ETL…', 'info');
    await new Promise(r => setTimeout(r, 0));
    try {
      const response = window.DSEApi.runEtl();
      if (!response || (!response.success && !response.job_id)) {
        throw new Error((response && response.error) || 'Falha ao rodar ETL.');
      }
      const jobId = response.job_id;
      if (jobId) {
        startRunningProgress(24, 'Lendo planilhas e montando Base_Produtos…', 92);
        const result = await new Promise((resolve, reject) => {
          const iv = setInterval(async () => {
            try {
              const r = await fetch('/api/jobs/' + jobId);
              const job = await r.json();
              if (job.status === 'done') { clearInterval(iv); resolve(job.result || {}); }
              else if (job.status === 'failed') { clearInterval(iv); reject(new Error(job.error || 'ETL falhou.')); }
              else if (job.status === 'running' && job.result && job.result.progress_pct) {
                setProgress({
                  val: Math.max(28, Math.min(95, Number(job.result.progress_pct) || 28)),
                  label: job.result.progress_label || 'ETL em andamento…',
                });
              } else if (job.status === 'pending') {
                setProgress({ val:18, label:'Job de ETL enfileirado…' });
              }
            } catch (e) { clearInterval(iv); reject(e); }
          }, 2500);
        });
        stopRunningProgress();
        setProgress({ val:100, label:'ETL concluído.' });
        const warnings = Array.isArray(result.warnings) ? result.warnings : [];
        const normalizedAlerts = normalizeEtlAlerts(warnings);
        setAlerts(normalizedAlerts);
        const baseLink = result.sheet_url || (result.links && result.links.base_produtos) || '';
        const linkETL = baseLink ? ` <a href="${baseLink}" target="_blank" style="color:var(--shopper-green);text-decoration:underline">Abrir planilha →</a>` : '';
        addLog(`ETL concluído.${result.plano_auto_generated ? ' Plano gerado automaticamente.' : ''}${linkETL}`, 'success');
        addLog(summarizeEtlWarnings(warnings), warnings.length > 0 ? 'warn' : 'info');
        setStatusMsg('ETL concluído.', 'success');
      } else {
        const warnings = Array.isArray(response.warnings) ? response.warnings : [];
        setAlerts(normalizeEtlAlerts(warnings));
        setProgress({ val:100, label:'ETL concluído.' });
        addLog(`ETL concluído. ${response.plano_auto_generated ? 'Plano gerado automaticamente.' : ''}`, 'success');
        addLog(summarizeEtlWarnings(warnings), warnings.length > 0 ? 'warn' : 'info');
        setStatusMsg('ETL concluído.', 'success');
      }
    } catch (err) {
      stopRunningProgress();
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setRunning(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const handleVendasAlvo = async () => {
    if (!lojas.length) { addLog('Selecione ao menos uma loja.', 'error'); return; }
    setRunning('vendas');
    setProgress({ val:12, label:'Enfileirando Vendas Alvo…' });
    addLog('Iniciando job de Vendas Alvo…', 'info');
    await new Promise(r => setTimeout(r, 0));
    try {
      const response = await window.DSEApi.buildSalesTargetAsync({
        data_inicial: dates.ini,
        data_final: dates.fim,
        stores: lojas,
      });
      if (!response || (!response.success && !response.job_id)) {
        throw new Error((response && response.error) || 'Falha ao montar Vendas Alvo.');
      }
      const jobId = response.job_id;
      if (!jobId) {
        throw new Error('Job de Vendas Alvo não retornou identificador.');
      }

      startRunningProgress(28, 'Consultando card 823 e montando Vendas Alvo…', 92);
      const result = await new Promise((resolve, reject) => {
        const iv = setInterval(async () => {
          try {
            const r = await fetch('/api/jobs/' + jobId);
            const job = await r.json();
            if (job.status === 'done') {
              clearInterval(iv);
              resolve(job.result || {});
            } else if (job.status === 'failed') {
              clearInterval(iv);
              reject(new Error(job.error || 'Vendas Alvo falhou.'));
            } else if (job.status === 'running' && job.result && job.result.progress_pct) {
              setProgress({
                val: Math.max(35, Math.min(95, Number(job.result.progress_pct) || 35)),
                label: job.result.progress_label || 'Montando Vendas Alvo…',
              });
            } else if (job.status === 'pending') {
              setProgress({ val:20, label:'Job de Vendas Alvo enfileirado…' });
            }
          } catch (e) {
            clearInterval(iv);
            reject(e);
          }
        }, 1800);
      });
      stopRunningProgress();
      setProgress({ val:100, label:'Vendas Alvo concluído.' });
      if (result && result.success) {
        const linkVA = result.sheet_url ? ` <a href="${result.sheet_url}" target="_blank" style="color:var(--shopper-green);text-decoration:underline">Abrir planilha →</a>` : '';
        addLog(`Vendas Alvo concluído. ${result.rows_written || 0} linhas escritas.${linkVA}`, 'success');
        setStatusMsg('Vendas Alvo concluído.', 'success');
      } else {
        throw new Error((result && result.error) || 'Falha ao montar Vendas Alvo.');
      }
    } catch (err) {
      stopRunningProgress();
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setRunning(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const handleEscaninhos = async () => {
    setRunning('escs');
    setProgress({ val:40, label:'Gerando escaninhos…' });
    addLog('Gerando escaninhos…', 'info');
    await new Promise(r => setTimeout(r, 0));
    try {
      const response = window.DSEApi.generateSlots();
      if (response && response.success) {
        setProgress({ val:100, label:'Escaninhos gerados.' });
        addLog(`${response.slots_generated || 0} escaninhos gerados.`, 'success');
        setStatusMsg('Escaninhos gerados com sucesso.', 'success');
      } else {
        throw new Error((response && response.error) || 'Falha ao gerar escaninhos.');
      }
    } catch (err) {
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setRunning(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const handleImportCard175 = async () => {
    setRunning('c175');
    setProgress({ val:35, label:'Importando Card 175…' });
    addLog('Importando Card 175…', 'info');
    await new Promise(r => setTimeout(r, 0));
    try {
      const selected = STORES.find(s => s.id === loja);
      const response = window.DSEApi.importCard175Metabase({
        sheet_link: links.mapaEq,
        store_code: loja,
        galpao: selected ? selected.codigo : '',
      });
      if (response && response.success) {
        setProgress({ val:100, label:'Plano inicial criado.' });
        addLog(`Importação do Card 175 concluída. ${response.rows_fetched_raw || 0} linhas lidas.`, 'success');
        setStatusMsg('Importação do Card 175 concluída.', 'success');
      } else {
        throw new Error((response && response.error) || 'Falha ao importar Card 175.');
      }
    } catch (err) {
      addLog(String(err), 'error');
      setStatusMsg(String(err), 'error');
    } finally {
      setRunning(null);
      setTimeout(() => setProgress(null), 500);
    }
  };

  const statusColor = { success:'#0DAB77', error:'#EF4444', info:'#94A3B8', warn:'#F59E0B' };

  const cfgContent = (
    <div style={{ display:'flex', flex:1, minHeight:0, gap:0 }}>

      {/* ── LEFT: Form ──────────────────────────── */}
      <div style={{ flex:'0 0 460px', overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Flow selector */}
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Fluxo de trabalho</div>
          <div style={{ display:'flex', gap:6 }}>
            {[['1','Endereçar nova loja'],['2','Reendereçar (Card 175)']].map(([v,label]) => (
              <button key={v} onClick={() => setFlow(+v)}
                style={{ flex:1, padding:'8px 10px', fontSize:11, fontWeight:700, borderRadius:6, cursor:'pointer', textAlign:'left',
                  border: flow === +v ? '1px solid var(--shopper-green)' : '1px solid var(--cfg-border)',
                  background: flow === +v ? 'rgba(13,171,119,0.10)' : 'var(--cfg-input-bg)',
                  color: flow === +v ? 'var(--shopper-green)' : 'var(--cfg-text-muted)', fontFamily:'var(--font-sans)' }}>
                <span style={{ display:'block', fontSize:9, opacity:0.7, marginBottom:2 }}>FLUXO {v}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Planilhas */}
        <div>
          <div style={sectionLabel}>Planilhas</div>
          {flow === 1 ? (<>
            <Field label="Endereçamento" value={links.ender} onChange={v=>setLinks(l=>({...l,ender:v}))} />
            <Field label="ETL" value={links.etl} onChange={v=>setLinks(l=>({...l,etl:v}))} />
            <Field label="Mix" value={links.mix} onChange={v=>setLinks(l=>({...l,mix:v}))} />
          </>) : (<>
            <Field label="Mapa de Equipamentos" value={links.mapaEq} onChange={v=>setLinks(l=>({...l,mapaEq:v}))} />
            <Field label="ETL" value={links.etl} onChange={v=>setLinks(l=>({...l,etl:v}))} />
            <Field label="Mix" value={links.mix} onChange={v=>setLinks(l=>({...l,mix:v}))} />
            <div style={{ marginBottom:8 }}>
              <label style={fieldLabel}>Loja</label>
              <select value={loja} onChange={e => { setLoja(e.target.value); onStoreChange && onStoreChange(STORES.find(s=>s.id===e.target.value)); }}
                style={{ width:'100%', padding:'6px 10px', fontSize:11, background:'var(--cfg-input-bg)', border:'1px solid var(--cfg-border)', borderRadius:5, color:'var(--cfg-text)' }}>
                <option value="">Selecionar loja…</option>
                {STORES.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              {loja && <div style={{ fontSize:10, color:'var(--cfg-text-muted)', marginTop:3 }}>Código interno: {STORES.find(s=>s.id===loja)?.codigo}</div>}
            </div>
          </>)}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <CfgBtn label="Salvar links" onClick={handleSaveLinks} loading={running==='save'} disabled={!!running && running!=='save'} />
            {flow === 1 && <>
              <CfgBtn label="Rodar ETL" primary onClick={handleETL} loading={running==='etl'} disabled={!!running && running!=='etl'} />
              <CfgBtn label="Gerar escaninhos" onClick={handleEscaninhos} loading={running==='escs'} disabled={!!running && running!=='escs'} />
            </>}
            {flow === 2 && <CfgBtn label="Importar Card 175" primary onClick={handleImportCard175} loading={running==='c175'} disabled={!!running && running!=='c175'} />}
          </div>
        </div>

        {/* Section: Vendas Alvo (Fluxo 1 only) */}
        {flow === 1 && (
          <div style={{ background:'var(--cfg-input-bg)', border:'1px solid var(--cfg-border)', borderRadius:8, padding:'12px 14px' }}>
            <div style={sectionLabel}>Vendas Alvo via Metabase <span style={{ color:'#94A3B8', fontWeight:400 }}>(card 823)</span></div>
            <div style={{ display:'flex', gap:8, marginBottom:6 }}>
              <div style={{ flex:1 }}>
                <label style={fieldLabel}>Data inicial</label>
                <input type="date" value={dates.ini} onChange={e=>setDates(d=>({...d,ini:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', fontSize:11, background:'var(--cfg-surface)', border:'1px solid var(--cfg-border)', borderRadius:4, color:'var(--cfg-text)' }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={fieldLabel}>Data final</label>
                <input type="date" value={dates.fim} onChange={e=>setDates(d=>({...d,fim:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', fontSize:11, background:'var(--cfg-surface)', border:'1px solid var(--cfg-border)', borderRadius:4, color:'var(--cfg-text)' }} />
              </div>
            </div>
            <div style={{ marginBottom:10 }}>
              <button
                onClick={()=>setDates({ ini: (METABASE_SALES && METABASE_SALES.earliest_date) || '2020-01-01', fim: new Date().toISOString().slice(0,10) })}
                style={smallBtnStyle('transparent','var(--cfg-border)','var(--cfg-text-muted)')}>
                ⟵ Período completo
              </button>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Lojas</span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={()=>setLojas(STORES.map(s=>s.id))} style={smallBtnStyle('transparent','var(--cfg-border)','var(--cfg-text-muted)')}>Todas</button>
                <button onClick={()=>setLojas([])} style={smallBtnStyle('transparent','var(--cfg-border)','var(--cfg-text-muted)')}>Limpar</button>
                <span style={{ fontSize:10, color:lojas.length>0?'var(--shopper-green)':'var(--cfg-text-muted)', fontWeight:700 }}>{lojas.length}/{STORES.length} selecionadas</span>
              </div>
            </div>
            <StoreCheckboxes selected={lojas} onChange={setLojas} />
            <div style={{ display:'flex', gap:6, marginTop:10 }}>
              <CfgBtn label="Montar Vendas Alvo" primary onClick={handleVendasAlvo} loading={running==='vendas'} disabled={!!running && running!=='vendas'} />
              <CfgBtn label="Baixar XLSX bruto" onClick={()=>{
                try {
                  const firstStore = lojas[0] || '';
                  const response = window.DSEApi.exportSalesXlsx({
                    data_inicial: dates.ini,
                    data_final: dates.fim,
                    loja: firstStore,
                    cod_loja: firstStore,
                  });
                  if (response && response.success && response.download_url) {
                    window.location.href = response.download_url;
                    addLog('Download iniciado.', 'success');
                  } else {
                    throw new Error((response && response.error) || 'Falha ao exportar XLSX bruto.');
                  }
                } catch (err) {
                  addLog(String(err), 'error');
                  setStatusMsg(String(err), 'error');
                }
              }} disabled={!!running} />
            </div>
          </div>
        )}

        {/* Section: Abrir Mapa */}
        <div style={{ borderTop:'1px solid var(--cfg-border)', paddingTop:14 }}>
          <div style={sectionLabel}>Abrir mapa</div>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--cfg-text-muted)', marginBottom:10, cursor:'pointer' }}>
            <input type="checkbox" checked={autoOpen} onChange={e=>setAutoOpen(e.target.checked)} style={{ accentColor:'var(--shopper-green)' }} />
            Abrir automaticamente ao recarregar (se houver plano salvo)
          </label>
          <CfgBtn label="Abrir mapa →" primary onClick={onOpenMap} />
        </div>
      </div>

      {/* ── RIGHT: Status + Logs + Alerts ────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--cfg-border)', minHeight:0 }}>

        {/* Status bar */}
        <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--cfg-border)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:statusColor[status.type], display:'inline-block', flexShrink:0 }}></span>
          <span style={{ fontSize:12, color:'var(--cfg-text)', fontFamily:'var(--font-numeric)' }}>{status.msg}</span>
        </div>

        {/* Progress bar */}
        {progress && (
          <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--cfg-border)', flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:4 }}>
              <span style={{ fontSize:10, color:'var(--cfg-text-muted)' }}>{progress.label}</span>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--shopper-green)' }}>{progress.val}%</span>
            </div>
            <div style={{ height:4, background:'var(--cfg-border)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${progress.val}%`, background:'var(--shopper-green)', borderRadius:2, transition:'width 0.25s ease' }}></div>
            </div>
          </div>
        )}

        {/* Log list */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 16px', minHeight:0 }}>
          {logs.length === 0 && <div style={{ color:'var(--cfg-text-muted)', fontSize:11, paddingTop:8 }}>Nenhuma operação executada ainda.</div>}
          {logs.map((e, i) => <LogItem key={i} entry={e} />)}
          <div ref={logsEndRef} />
        </div>

        {/* ETL Alerts */}
        <div style={{ borderTop:'1px solid var(--cfg-border)', padding:'10px 16px', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Alertas ETL</div>
          {alerts.length === 0
            ? <div style={{ fontSize:11, color:'var(--cfg-text-muted)' }}>Nenhum alerta crítico no ETL.</div>
            : alerts.map(a => <AlertCard key={a.id} alert={a} onSend={handleSendAlert} onRefresh={handleRefreshAlert} sending={alertAction && alertAction.id === a.id && alertAction.mode === 'send'} refreshing={alertAction && alertAction.id === a.id && alertAction.mode === 'refresh'} />)
          }
        </div>
      </div>
    </div>
  );

  // As full-page primary view
  if (!asOverlay) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--cfg-surface)' }}>
        <div style={{ padding:'14px 24px', borderBottom:'1px solid var(--cfg-border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--cfg-text)' }}>Configuração do endereçamento</div>
            <div style={{ fontSize:11, color:'var(--cfg-text-muted)', marginTop:1 }}>Configure as planilhas e gere o plano antes de abrir o mapa.</div>
          </div>
          <div style={{ fontSize:10, color:'var(--cfg-text-muted)', background:'var(--cfg-input-bg)', padding:'4px 10px', borderRadius:20, border:'1px solid var(--cfg-border)' }}>
            Nenhum mapa aberto
          </div>
        </div>
        {cfgContent}
      </div>
    );
  }

  // As overlay over the map
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:52 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:'min(900px, 92vw)', height:'calc(100vh - 72px)', display:'flex', flexDirection:'column',
        background:'var(--cfg-surface)', borderRadius:10, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.4)', border:'1px solid var(--cfg-border)' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--cfg-border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--cfg-text)' }}>Configuração</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--cfg-text-muted)', fontSize:18, lineHeight:1, padding:'2px 6px' }}>✕</button>
        </div>
        {cfgContent}
      </div>
    </div>
  );
}

const sectionLabel = { fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 };
const fieldLabel = { display:'block', fontSize:10, fontWeight:700, color:'var(--cfg-text-muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.06em' };

Object.assign(window, { DSEConfigPanel });
