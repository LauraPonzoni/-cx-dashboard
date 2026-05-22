# CX Dashboard · Tiendanube

Dashboard de evolución semanal/mensual de métricas CX para **Chat Nube** y **Social & MKT**.

## Stack
- **Next.js 14** · **Recharts** · Deploy en **Vercel**
- Datos: Google Sheets espejo público (CSV export, sin auth)

---

## Setup paso a paso

### 1. Encontrar el GID de "Hoja 2" (Social & MKT)

Abrí el sheet espejo → hacé click en la pestaña "Hoja 2" → mirá la URL:
`...edit#gid=NÚMERO`

Ese número va en `/pages/api/metrics.js`, línea:
```js
socialMkt: { gid: 'TU_NÚMERO_ACÁ', name: 'Social & MKT' },
```

### 2. Instalar y probar local

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 3. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: cx dashboard"
# Crear repo en github.com, luego:
git remote add origin https://github.com/TU_ORG/cx-dashboard.git
git push -u origin main
```

### 4. Deploy en Vercel

- vercel.com → New Project → importar repo → Deploy ✓
- Vercel detecta Next.js automáticamente
- URL pública en ~2 minutos

### 5. Re-deploy automático

Cada `git push` a `main` re-despliega automáticamente.  
El sheet se actualiza en el dashboard con cache de 1 hora.

---

## Estructura del sheet espejo

El sheet espejo (`IMPORTRANGE` desde el privado) debe tener:
- **Hoja 1**: datos de Chat Nube
- **Hoja 2**: datos de Social & MKT

Ambas hojas con el mismo formato:
- Fila 1: labels de meses ("Diciembre", "Week", "Week", "Enero", ...)
- Fila 2: números de semana (52, 1, 2, 3, ...)
- Fila 3: fechas (22-dic-, 5-ene-, ...)
- Fila 4+: métricas (CSAT, SLA, TTR, tickets, etc.)

---

## Métricas parseadas automáticamente

| Grupo | Métricas |
|---|---|
| Calidad & CSAT | CSAT, CSAT Evolución, Thumbs+/-, Response Rate |
| Time Response | SLA Attainment, TR <24h, Plan1/2/3, Freemium, Next |
| Resolución | TTR <48h |
| Volumen | Tickets Created/Closed, Incoming, In/Out Interactions |
| Productividad | Tickets/Gurú, OIs/Gurú, IIs/Ticket, OIs/Ticket |
| Equipo | Ausentismo no planeado, programado, total |
| Calidad detalle | Problems %, Issues %, Side Conversations % |

## Agregar una métrica nueva

En `/pages/api/metrics.js`:
```js
// 1. Agregar el patrón regex:
const PATTERNS = {
  mi_metrica: /regex que matchea la celda A del sheet/i,
  ...
}

// 2. Agregar label y tipo:
const LABELS = { mi_metrica: 'Mi Métrica', ... }
const TYPES  = { mi_metrica: 'percent', ... } // 'percent' | 'number' | 'decimal'
```

En `/pages/index.js`, agregar `'mi_metrica'` al grupo que corresponda en `GROUPS`.

---

## Troubleshooting

**"HTTP 401" o sheet vacío**
→ El sheet espejo no es público. Compartir → "Cualquier persona con el enlace" → Lector.

**Social & MKT sin datos**
→ El GID de Hoja 2 es incorrecto. Ver paso 1 del setup.

**Métricas en 0 o null**
→ El IMPORTRANGE no autorizó. Abrir el sheet espejo y aceptar el permiso que aparece sobre la celda A1.
