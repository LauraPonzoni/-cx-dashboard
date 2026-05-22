import { useState, useEffect, useMemo, useCallback } from 'react'
import Head from 'next/head'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

// ── OKR targets ───────────────────────────────────────────────────────────
const TARGETS = {
  csat: 0.94, csat_summary: 0.94, csat_evolucion: 0.96, csat_evolucion_okr: 0.96,
  tr_24h: 0.99, tr_24h_summary: 0.99,
  sla: 0.90, sla_summary: 0.90,
  tr_freemium: 0.90, tr_freemium_s: 0.90,
  tr_plan1: 0.90, tr_plan1_s: 0.90,
  tr_plan2: 0.90, tr_plan2_s: 0.90,
  tr_plan3: 0.90, tr_plan3_s: 0.90,
  tr_partners: 0.90, tr_next: 0.90, tr_evolucion: 0.90,
  ttr_48h: 0.90, ttr_24h_evo: 0.85,
  ausentismo_np: 0.03, ausentismo_prog: 0.07,
}

const C = { cn: '#00d4c8', sm: '#9b6dff', target: '#f5a623', grid: '#1c2228' }

// Grupos de métricas para los tabs de navegación
const GROUPS = {
  'Calidad & CSAT':   ['csat', 'csat_summary', 'csat_evolucion', 'thumbs_plus', 'thumbs_minus', 'response_rate'],
  'Time Response':    ['sla', 'tr_24h', 'tr_plan1', 'tr_plan2', 'tr_plan3', 'tr_freemium', 'tr_partners', 'tr_next', 'tr_evolucion'],
  'TTR':              ['ttr_48h', 'ttr_24h_evo'],
  'Volumen':          ['tickets_created', 'tickets_closed', 'in_interactions', 'out_interactions', 'incoming', 'tendencia_evo'],
  'Productividad':    ['productivity', 'ois_hora', 'iis_ticket', 'ois_ticket'],
  'Calidad detalle':  ['problems', 'issues', 'side_conv'],
  'Equipo':           ['ausentismo_np', 'ausentismo_prog', 'ausentismo_total', 'gurus_working'],
}

// Métricas prioritarias en el resumen top
const SUMMARY = ['csat', 'sla', 'tr_24h', 'ttr_48h', 'tickets_created', 'productivity']

// ── Formatters ────────────────────────────────────────────────────────────
function fmt(v, type) {
  if (v == null) return '—'
  if (type === 'pct')    return `${(v * 100).toFixed(1)}%`
  if (type === 'dec')    return v.toFixed(2)
  if (type === 'num')    return v >= 1000 ? `${(v/1000).toFixed(1)}k` : Math.round(v).toLocaleString('es-AR')
  return String(v)
}

function dotColor(v, key) {
  const t = TARGETS[key]
  if (!t || v == null) return 'var(--text-muted)'
  const lower = key.startsWith('ausentismo')
  if (lower) {
    return v <= t ? 'var(--good)' : v <= t * 1.4 ? 'var(--warn)' : 'var(--bad)'
  }
  return v >= t ? 'var(--good)' : v >= t * 0.97 ? 'var(--warn)' : 'var(--bad)'
}

// ── Helpers de serie ──────────────────────────────────────────────────────
function latest(arr) {
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]
  return null
}
function weekTrend(arr) {
  if (!arr) return null
  const vals = arr.filter(v => v != null)
  if (vals.length < 2) return null
  return vals[vals.length-1] - vals[vals.length-2]
}

// ── Componentes base ──────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:18, background:'var(--bg)' }}>
      <div style={{ width:42, height:42, borderRadius:'50%', border:'3px solid var(--border)', borderTopColor:'var(--accent-cyan)', animation:'spin .7s linear infinite' }}/>
      <p style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text-secondary)' }}>Leyendo el sheet…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Err({ msg }) {
  return (
    <div style={{ background:'rgba(255,79,94,.08)', border:'1px solid rgba(255,79,94,.22)', borderRadius:8, padding:'11px 16px', color:'#ff9aa2', fontFamily:'var(--font-mono)', fontSize:12, margin:'10px 0' }}>
      ⚠ {msg}
    </div>
  )
}

// Tooltip personalizado para los gráficos
const ChartTip = ({ active, payload, label, type }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', fontFamily:'var(--font-mono)', fontSize:12 }}>
      <p style={{ color:'var(--text-muted)', marginBottom:5, fontSize:10 }}>{label}</p>
      {payload.map((p, i) => p.value != null && (
        <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:p.color, display:'inline-block', flexShrink:0 }}/>
          <span style={{ color:'var(--text-secondary)' }}>{p.name}:</span>
          <span style={{ color:'var(--text-primary)', fontWeight:600 }}>{fmt(p.value, type)}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card: muestra CN y SM side by side ────────────────────────────────
function KpiCard({ metricKey, label, type, cnVal, smVal, cnTrend, smTrend }) {
  const cnC = dotColor(cnVal, metricKey)
  const smC = dotColor(smVal, metricKey)
  const t   = TARGETS[metricKey]

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border-subtle)', borderRadius:14, padding:'16px 18px', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <p style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:'var(--font-body)', lineHeight:1.35, maxWidth:'75%' }}>{label}</p>
        {t && <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent-amber)', opacity:.75 }}>OKR {fmt(t,'pct')}</span>}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[['Chat Nube', cnVal, cnC, cnTrend, C.cn], ['Social & MKT', smVal, smC, smTrend, C.sm]].map(([name, val, color, trend, accent]) => (
          <div key={name} style={{ background:'var(--surface-2)', borderRadius:9, padding:'10px 12px', borderLeft:`3px solid ${accent}` }}>
            <p style={{ fontSize:10, fontFamily:'var(--font-mono)', color:accent, marginBottom:5, letterSpacing:'0.03em' }}>{name}</p>
            <p style={{ fontSize:24, fontFamily:'var(--font-display)', fontWeight:700, color, letterSpacing:'-0.02em', lineHeight:1 }}>
              {fmt(val, type)}
            </p>
            {trend != null && (
              <p style={{ fontSize:10, fontFamily:'var(--font-mono)', marginTop:3, color: trend >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend * 100).toFixed(1)}pp
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Gráfico de línea temporal ─────────────────────────────────────────────
function MetricChart({ metricKey, type, cnSeries, smSeries, cnCols, smCols, viewMode }) {
  const target = TARGETS[metricKey]

  // Construir puntos del eje X usando las columnas de CN como base
  const data = useMemo(() => {
    const base = viewMode === 'monthly'
      ? cnCols.filter(c => c.type === 'month')
      : cnCols.filter(c => c.type === 'week')

    return base.map(col => {
      const cn = cnSeries ? (cnSeries[cnCols.indexOf(col)] ?? null) : null
      // Para SM intentamos alinear por fecha/display
      let sm = null
      if (smSeries) {
        // Primero por display exacto
        const smIdx = smCols.findIndex(sc => sc.display === col.display)
        if (smIdx >= 0) sm = smSeries[smIdx] ?? null
        // Fallback: mismo índice
        if (sm == null) {
          const i = cnCols.indexOf(col)
          sm = smSeries[i] ?? null
        }
      }
      if (cn == null && sm == null) return null
      return { name: col.display, cn, sm }
    }).filter(Boolean)
  }, [cnCols, smCols, cnSeries, smSeries, viewMode])

  if (!data.length) return (
    <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, fontFamily:'var(--font-mono)', padding:36 }}>
      Sin datos para esta vista
    </div>
  )

  const allV   = data.flatMap(d => [d.cn, d.sm]).filter(v => v != null)
  const minV   = Math.min(...allV), maxV = Math.max(...allV)
  const pad    = Math.max((maxV - minV) * 0.1, 0.03)
  const domain = type === 'pct'
    ? [Math.max(0, minV - pad), Math.min(1.05, maxV + pad)]
    : ['auto', 'auto']

  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top:6, right:6, bottom:0, left:0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke={C.grid} vertical={false}/>
        <XAxis dataKey="name"
          tick={{ fill:'var(--text-muted)', fontSize:10, fontFamily:'DM Mono' }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        <YAxis domain={domain}
          tick={{ fill:'var(--text-muted)', fontSize:10, fontFamily:'DM Mono' }}
          axisLine={false} tickLine={false}
          tickFormatter={v => fmt(v, type)} width={44}
        />
        <Tooltip content={<ChartTip type={type}/>}/>
        {target && type === 'pct' && (
          <ReferenceLine y={target} stroke={C.target} strokeDasharray="4 3" strokeWidth={1.5}
            label={{ value:`OKR ${fmt(target,'pct')}`, fill:C.target, fontSize:9, fontFamily:'DM Mono', position:'insideTopRight' }}
          />
        )}
        {cnSeries && <Line name="Chat Nube"    dataKey="cn" stroke={C.cn} strokeWidth={2} dot={false} activeDot={{ r:4 }} connectNulls/>}
        {smSeries && <Line name="Social & MKT" dataKey="sm" stroke={C.sm} strokeWidth={2} dot={false} activeDot={{ r:4 }} connectNulls strokeDasharray="5 2"/>}
        <Legend wrapperStyle={{ fontFamily:'DM Mono', fontSize:10, color:'var(--text-secondary)', paddingTop:4 }} iconType="circle" iconSize={6}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Página principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [viewMode, setViewMode] = useState('weekly')
  const [group,    setGroup]    = useState('Calidad & CSAT')
  const [ts,       setTs]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/metrics')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setData(j); setTs(new Date())
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner/>

  const cnCols = data?.cnCols || []
  const smCols = data?.smCols || []
  const cnM    = data?.chatNube?.metrics  || {}
  const smM    = data?.socialMkt?.metrics || {}
  const labels = data?.metricLabels || {}
  const types  = data?.metricTypes  || {}

  return (
    <>
      <Head>
        <title>CX Dashboard · Tiendanube</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
      </Head>
      <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

        {/* ── Header ───────────────────────────────────── */}
        <header style={{
          height:58, borderBottom:'1px solid var(--border-subtle)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 28px', position:'sticky', top:0, zIndex:200,
          background:'rgba(10,13,15,0.93)', backdropFilter:'blur(16px)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#00d4c8,#9b6dff)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontWeight:800, fontSize:15, color:'#000' }}>N</div>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15, letterSpacing:'-0.02em' }}>CX Dashboard</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', background:'var(--surface-2)', padding:'2px 9px', borderRadius:20 }}>
              Chat Nube · Social & MKT
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {ts && <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>
              Actualizado {ts.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
            </span>}
            <button onClick={load}
              style={{ background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-mono)', fontSize:12, padding:'6px 14px', borderRadius:6, cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e=>{e.target.style.borderColor='var(--accent-cyan)';e.target.style.color='var(--accent-cyan)'}}
              onMouseLeave={e=>{e.target.style.borderColor='var(--border)';e.target.style.color='var(--text-secondary)'}}>
              ↻ Refresh
            </button>
          </div>
        </header>

        <main style={{ maxWidth:1360, margin:'0 auto', padding:'32px 26px 80px' }}>
          {error && <Err msg={error}/>}
          {data?.chatNube?.error  && <Err msg={`Chat Nube: ${data.chatNube.error}`}/>}
          {data?.socialMkt?.error && <Err msg={`Social & MKT: ${data.socialMkt.error}`}/>}

          {data && (<>
            {/* ── KPI Cards ─────────────────────────────── */}
            <section style={{ marginBottom:52 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, letterSpacing:'-0.02em' }}>
                  KPIs · Último dato disponible
                </h2>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>
                  CN: {cnCols.filter(c=>c.type==='week').length} semanas · SM: {smCols.filter(c=>c.type==='week').length} semanas
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:12 }}>
                {SUMMARY.map(key => (
                  <KpiCard key={key}
                    metricKey={key}
                    label={labels[key] || key}
                    type={types[key]}
                    cnVal={latest(cnM[key])}
                    smVal={latest(smM[key])}
                    cnTrend={weekTrend(cnM[key])}
                    smTrend={weekTrend(smM[key])}
                  />
                ))}
              </div>
            </section>

            {/* ── Gráficos de evolución ──────────────────── */}
            <section>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:10 }}>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, letterSpacing:'-0.02em' }}>
                  Evolución
                </h2>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  {/* Tabs de grupo */}
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                    {Object.keys(GROUPS).map(g => (
                      <button key={g} onClick={()=>setGroup(g)} style={{
                        background: group===g ? 'var(--surface-3)' : 'transparent',
                        border:`1px solid ${group===g?'var(--border)':'transparent'}`,
                        color: group===g ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontFamily:'var(--font-mono)', fontSize:11,
                        padding:'5px 11px', borderRadius:6, cursor:'pointer', transition:'all .15s',
                      }}>
                        {g}
                      </button>
                    ))}
                  </div>
                  {/* Toggle semanas / meses */}
                  <div style={{ display:'flex', background:'var(--surface-2)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:3 }}>
                    {[['weekly','Semanas'],['monthly','Meses']].map(([m,l])=>(
                      <button key={m} onClick={()=>setViewMode(m)} style={{
                        background: viewMode===m ? 'var(--surface-3)' : 'transparent',
                        border:'none', color: viewMode===m ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        fontFamily:'var(--font-mono)', fontSize:11,
                        padding:'5px 14px', borderRadius:5, cursor:'pointer', transition:'all .15s',
                      }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(400px,1fr))', gap:13 }}>
                {(GROUPS[group]||[]).map(key => {
                  const cnS = cnM[key], smS = smM[key]
                  const hasCn = cnS?.some(v=>v!=null)
                  const hasSm = smS?.some(v=>v!=null)
                  if (!hasCn && !hasSm) return null

                  return (
                    <div key={key} style={{ background:'var(--surface)', border:'1px solid var(--border-subtle)', borderRadius:14, padding:'18px 16px 10px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                        <p style={{ fontFamily:'var(--font-body)', fontSize:13, fontWeight:500, color:'var(--text-primary)', lineHeight:1.3, maxWidth:'72%' }}>
                          {labels[key] || key}
                        </p>
                        <div style={{ display:'flex', gap:4 }}>
                          {hasCn && <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:C.cn, background:'rgba(0,212,200,.08)', padding:'2px 7px', borderRadius:20 }}>CN</span>}
                          {hasSm && <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:C.sm, background:'rgba(155,109,255,.08)', padding:'2px 7px', borderRadius:20 }}>SM</span>}
                        </div>
                      </div>
                      <MetricChart
                        metricKey={key}
                        type={types[key]}
                        cnSeries={hasCn ? cnS : null}
                        smSeries={hasSm ? smS : null}
                        cnCols={cnCols}
                        smCols={smCols}
                        viewMode={viewMode}
                      />
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Footer ──────────────────────────────────── */}
            <footer style={{ marginTop:60, paddingTop:20, borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>
                Fuente: Google Sheets espejo → Zendesk CX · Tiendanube/Nuvemshop
              </p>
              <p style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>
                Cache 1h · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('es-AR') : ''}
              </p>
            </footer>
          </>)}
        </main>
      </div>
    </>
  )
}
