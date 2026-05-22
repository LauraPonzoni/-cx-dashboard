/**
 * API: /api/metrics
 * Sheet espejo: 1PRMV8GcTRdXbDBRkd9NKxXXuigtuNk4XczU_VBcSa8g
 * Hoja 1 (gid=0)          → Chat Nube
 * Hoja 2 (gid=2023931060) → Social & MKT
 *
 * Estructura de cada hoja:
 *   Fila 0: labels de columna ("rrrrrrr","Week","Week","Diciembre","Week",...)
 *   Fila 1: números de semana ("52","52","12","1","2","3","4","1","5",...)
 *   Fila 2: fechas ("22-dic-","29-dic-","","5-ene-","12-ene-",...)
 *   Fila 3: "OKRs"  (separador, ignorar)
 *   Fila 4+: métricas
 */

const SHEET_ID = '1PRMV8GcTRdXbDBRkd9NKxXXuigtuNk4XczU_VBcSa8g'
const TABS = {
  chatNube:  { gid: '0',          name: 'Chat Nube'    },
  socialMkt: { gid: '2023931060', name: 'Social & MKT' },
}

// ── CSV parser robusto ─────────────────────────────────────────────────────
function parseLine(line) {
  const out = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { out.push(cur); cur = '' }
    else { cur += c }
  }
  out.push(cur)
  return out.map(v => v.trim())
}
const parseCSV = t => t.split('\n').map(parseLine)

// ── Value parsers ──────────────────────────────────────────────────────────
const JUNK = new Set(['', '-', '.', '#value!', '#div/0!', '#ref!', '#n/a', '-%'])
function pct(raw) {
  const s = raw.replace(/"/g, '').replace(/\s/g, '').toLowerCase()
  if (JUNK.has(s)) return null
  // Catch outliers like "9600%" from the sheet
  const n = parseFloat(s.replace('%','').replace(',','.'))
  if (isNaN(n) || n > 200 || n < -200) return null
  return n > 1 ? n / 100 : n
}
function num(raw) {
  const s = raw.replace(/"/g, '').replace(/\./g, '').replace(',', '.').trim()
  if (JUNK.has(s.toLowerCase())) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}
function dec(raw) {
  const s = raw.replace(/"/g, '').replace(',', '.').trim()
  if (JUNK.has(s.toLowerCase())) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// ── Column builder ─────────────────────────────────────────────────────────
// Hoja 1 fila 0: rrrrrrr, Week, Week, Diciembre, Week, Week,...
//         fila 1: [AR] Chat Nube, 52, 52, 12, 1, 2, 3, 4,...
//         fila 2: Week, 22-dic-, 29-dic-, , 5-ene-,...
// Los meses son las celdas donde fila0 NO es "Week" y NO está vacía (excepto col 0)
// Las semanas son donde fila0 == "Week" o fila1 tiene un número
function buildCols(row0, row1, row2) {
  const cols = []
  let lastMonth = ''
  // Determinamos cuántas columnas hay
  const len = Math.max(row0.length, row1.length, row2.length)

  for (let i = 1; i < len; i++) {
    const r0 = (row0[i] || '').trim()
    const r1 = (row1[i] || '').trim()
    const r2 = (row2[i] || '').trim()

    const isMonth = r0 !== '' && r0.toLowerCase() !== 'week' && !/^\d+$/.test(r0)
    if (isMonth) lastMonth = r0

    const isWeek  = r0.toLowerCase() === 'week' || /^\d+$/.test(r0)
    if (!r0 && !r1 && !r2) continue   // columna vacía, saltar

    cols.push({
      idx:     i,                        // posición 1-based en la fila del CSV
      label:   lastMonth,                // "Diciembre", "Enero", ...
      weekNum: r1,                       // "52","1","2",...
      date:    r2,                       // "22-dic-","5-ene-",...
      type:    isMonth ? 'month' : 'week',
      display: isMonth ? r0 : (r2 || `S${r1}`),
    })
  }
  return cols
}

// ── Metric registry ────────────────────────────────────────────────────────
// [pattern, key, type]  — primer match por fila gana
const REGISTRY = [
  // Calidad
  [/^\[CSAT\] CSAT consolidado en 94%/i,                     'csat',              'pct'],
  [/^CSAT 94%\s*$/i,                                         'csat_summary',      'pct'],
  [/^CSAT Evolución \(96%\)/i,                               'csat_evolucion',    'pct'],
  [/^\[CSAT\] CSAT Evolución/i,                              'csat_evolucion_okr','pct'],
  // Time response
  [/Responder 99%.*<24h/i,                                   'tr_24h',            'pct'],
  [/^Time Response 99%/i,                                    'tr_24h_summary',    'pct'],
  [/SLA att.*overall/i,                                      'sla',               'pct'],
  [/^SLA Att\. 90%/i,                                        'sla_summary',       'pct'],
  [/Responder 90%.*freemium.*<24h/i,                         'tr_freemium',       'pct'],
  [/Freemium 90%.*<24h/i,                                    'tr_freemium_s',     'pct'],
  [/Responder 90%.*plan 1.*<24h/i,                           'tr_plan1',          'pct'],
  [/Plan 1.*90%.*<24h/i,                                     'tr_plan1_s',        'pct'],
  [/Responder 90%.*plan 2.*<8h/i,                            'tr_plan2',          'pct'],
  [/Plan 2.*90%.*<(8|12)h/i,                                 'tr_plan2_s',        'pct'],
  [/Responder 90%.*plan 3.*<4h/i,                            'tr_plan3',          'pct'],
  [/Plan 3.*90%.*<4h/i,                                      'tr_plan3_s',        'pct'],
  [/Responder 90%.*partners.*<15m/i,                         'tr_partners',       'pct'],
  [/^Partners/i,                                             'tr_partners_s',     'pct'],
  [/Responder 90%.*Next.*<15/i,                              'tr_next',           'pct'],
  [/Evolución <1h/i,                                         'tr_evolucion',      'pct'],
  // TTR
  [/Resolver el 90%.*<48h/i,                                 'ttr_48h',           'pct'],
  [/TTR en 85%.*<24h/i,                                      'ttr_24h_evo',       'pct'],
  // Volumen
  [/^# Tickets Crea.*Chat Nube/i,                            'tickets_created',   'num'],
  [/^# Tickets Created\s*$/i,                                'tickets_created',   'num'],
  [/^# Tickets Closed/i,                                     'tickets_closed',    'num'],
  [/^# Tickets created Tiendanube Evolución/i,               'tickets_evo',       'num'],
  [/^# In Interaction/i,                                     'in_interactions',   'num'],
  [/^# Out Interaction/i,                                    'out_interactions',  'num'],
  [/^Incoming tendencia/i,                                   'incoming',          'pct'],
  [/^Tendencia Evolución/i,                                  'tendencia_evo',     'pct'],
  // Productividad / eficiencia
  [/Tickets cerrados\/gur/i,                                 'productivity',      'num'],
  [/OIs x Gur.*hora/i,                                       'ois_hora',          'dec'],
  [/^IIs x ticket/i,                                         'iis_ticket',        'dec'],
  [/^OIs x Ticket/i,                                         'ois_ticket',        'dec'],
  // Calidad detalle
  [/^Problems\s*$/i,                                         'problems',          'pct'],
  [/^Issues\s*$/i,                                           'issues',            'pct'],
  [/^Side Conversations %/i,                                 'side_conv',         'pct'],
  // CSAT detalle
  [/^Thumbs \+/i,                                            'thumbs_plus',       'num'],
  [/^Thumbs -/i,                                             'thumbs_minus',      'num'],
  [/^Response Rate \(%\)/i,                                  'response_rate',     'pct'],
  [/^Offered Rate/i,                                         'offered_rate',      'pct'],
  // Equipo / oferta
  [/% Ausentismo total.*no pl/i,                             'ausentismo_np',     'pct'],
  [/% Ausentismo programado/i,                               'ausentismo_prog',   'pct'],
  [/^Ausentismo Total/i,                                     'ausentismo_total',  'pct'],
  [/^\[Oferta\] Gurús trabajando/i,                          'gurus_working',     'num'],
  [/^\[Oferta\] Días útiles/i,                               'dias_utiles',       'num'],
]

const LABELS = {
  csat:              'CSAT Consolidado',
  csat_summary:      'CSAT (resumen)',
  csat_evolucion:    'CSAT Evolución',
  csat_evolucion_okr:'CSAT Evolución (OKR)',
  tr_24h:            'Time Response <24h',
  tr_24h_summary:    'Time Response <24h (resumen)',
  sla:               'SLA Attainment',
  sla_summary:       'SLA Att. (resumen)',
  tr_freemium:       'TR Freemium <24h',
  tr_freemium_s:     'TR Freemium <24h',
  tr_plan1:          'TR Plan 1 <24h',
  tr_plan1_s:        'TR Plan 1 <24h',
  tr_plan2:          'TR Plan 2 <8h',
  tr_plan2_s:        'TR Plan 2',
  tr_plan3:          'TR Plan 3 <4h',
  tr_plan3_s:        'TR Plan 3',
  tr_partners:       'TR Partners <15m',
  tr_partners_s:     'TR Partners',
  tr_next:           'TR Evolución <15m',
  tr_evolucion:      'TR Evolución <1h',
  ttr_48h:           'TTR <48h',
  ttr_24h_evo:       'TTR Evolución <24h',
  tickets_created:   '# Tickets Creados',
  tickets_closed:    '# Tickets Cerrados',
  tickets_evo:       '# Tickets Evolución',
  in_interactions:   'In Interactions',
  out_interactions:  'Out Interactions',
  incoming:          'Incoming (tendencia)',
  tendencia_evo:     'Tendencia Evolución',
  productivity:      'Tickets Cerrados/Gurú',
  ois_hora:          'OIs × Gurú × Hora',
  iis_ticket:        'IIs/Ticket',
  ois_ticket:        'OIs/Ticket',
  problems:          'Problems %',
  issues:            'Issues %',
  side_conv:         'Side Conversations %',
  thumbs_plus:       'Thumbs +',
  thumbs_minus:      'Thumbs −',
  response_rate:     'Response Rate',
  offered_rate:      'Offered Rate',
  ausentismo_np:     'Ausentismo No Planeado',
  ausentismo_prog:   'Ausentismo Programado',
  ausentismo_total:  'Ausentismo Total',
  gurus_working:     'Gurús Trabajando',
  dias_utiles:       'Días Útiles',
}

const TYPES = Object.fromEntries(
  REGISTRY.map(([, key, type]) => [key, type])
)

// ── Parse tab ──────────────────────────────────────────────────────────────
async function fetchTab(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cx-dashboard/1.0' },
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} en gid=${gid}`)
  const text = await res.text()
  const rows = parseCSV(text)

  // Filas de cabecera: 0, 1, 2
  const cols = buildCols(rows[0] || [], rows[1] || [], rows[2] || [])

  // Métricas a partir de fila 3 (la 3 suele ser "OKRs", separador)
  const metrics = {}
  const seen    = new Set()

  for (let r = 3; r < rows.length; r++) {
    const row  = rows[r]
    const name = (row[0] || '').trim()
    if (!name) continue

    for (const [pattern, key, type] of REGISTRY) {
      if (seen.has(key)) continue
      if (!pattern.test(name)) continue
      const parser = type === 'pct' ? pct : type === 'dec' ? dec : num
      metrics[key] = cols.map(col => parser(row[col.idx] || ''))
      seen.add(key)
      break
    }
  }

  return { cols, metrics }
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600')

  const [r1, r2] = await Promise.allSettled([
    fetchTab(TABS.chatNube.gid),
    fetchTab(TABS.socialMkt.gid),
  ])

  const cn = r1.status === 'fulfilled' ? r1.value : { cols: [], metrics: {}, error: r1.reason?.message }
  const sm = r2.status === 'fulfilled' ? r2.value : { cols: [], metrics: {}, error: r2.reason?.message }

  res.status(200).json({
    ok:           true,
    cnCols:       cn.cols,
    smCols:       sm.cols,
    metricLabels: LABELS,
    metricTypes:  TYPES,
    chatNube:  { name: 'Chat Nube',    metrics: cn.metrics, error: cn.error || null },
    socialMkt: { name: 'Social & MKT', metrics: sm.metrics, error: sm.error || null },
    fetchedAt: new Date().toISOString(),
  })
}
