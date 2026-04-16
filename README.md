# VisorInvestigaciones

Visor local para consultar investigacion de Gema desde archivos en disco, con indexador Node.js y UI React.

La V1 esta pensada como memoria operativa navegable: centraliza lineas de trabajo, timeline, estrategia, fuentes, hallazgos, acciones y temas repetidos sin depender de backend ni base de datos.

## Stack

- frontend: React + TypeScript + Vite
- indexador local: Node.js + TypeScript
- fuente de verdad: archivos en disco + indice generado en JSON
- persistencia: ninguna base de datos en V1

## Estructura

```text
VisorInvestigaciones/
  docs/
  data/
    generated/
      index.json
    sample/
      research/
  shared/
    domain.ts
  tools/
    indexer/
  web/
```

## Formatos soportados

### Legado

```text
research/
  gemma-domotica-openclaw/
    README.md
    findings.md
    sources.md
```

Interpretacion actual:

- `README.md`: estrategia/politica de la linea
- `findings.md`: hallazgos acumulados
- `sources.md`: fuentes acumuladas
- el indexador sintetiza una entrada cronologica `legacy-snapshot` para que la linea tenga timeline usable desde ya

### Estructurado futuro

```text
research/
  lines/
    <lineSlug>/
      line.json
      strategy.md
      sources/
        sources.json
      entries/
        <YYYY>/
          <timestampZ>--<entrySlug>/
            entry.json
            summary.md
            findings.json
            actions.json
            artifacts/
```

Notas:

- el parser acepta `findings.json`, `actions.json` y `sources.json` tanto como array directo como con envoltorios del tipo `{ findings: [...] }`, `{ actions: [...] }` o `{ items: [...] }`
- el timestamp del nombre de carpeta acepta `T10:15:00Z` y tambien la variante segura para Windows `T10-15-00Z`

## Modelo normalizado

El indexador genera un unico indice en:

- `data/generated/index.json`
- `web/public/data/generated/index.json`

Las entidades principales del modelo estan definidas en `shared/domain.ts`:

- `ResearchLine`
- `ResearchEntry`
- `Source`
- `Finding`
- `ActionItem`
- `RepeatedTopic`

## Como arrancar

### 1. Instalar dependencias

```bash
npm install
```

### 2. Modo automático (recomendado para trabajo activo)

El visor puede vigilar automáticamente los cambios en la carpeta de investigación y regenerar el índice:

```bash
npm run dev
```

Esto levanta **simultáneamente**:
- El indexador en modo watch (vigila cambios cada 3 segundos)
- La web en modo desarrollo (se recarga automáticamente)

La web detecta cambios en el índice cada 5 segundos y muestra la hora de última actualización.

**Variables de entorno:**

```bash
# Linux/Mac
RESEARCH_PATH=/home/pedro/.openclaw/workspace/research npm run dev

# Windows PowerShell
$env:RESEARCH_PATH = "C:\Users\pedro\.openclaw\workspace\research"
npm run dev

# Windows CMD
set RESEARCH_PATH=C:\Users\pedro\.openclaw\workspace\research
npm run dev
```

### 3. Modo manual (para uso puntual)

Si prefieres controlar cuándo se regenera el índice:

```bash
# Generar índice una vez
npm run index

# Arrancar solo la web
npm run web
```

O en un solo paso:
```bash
npm run dev:manual
```

### Scripts disponibles

- `npm run dev` → Indexador watch + Web dev (recomendado)
- `npm run dev:manual` → Indexa una vez y arranca web
- `npm run index` → Indexa una vez
- `npm run index:watch` → Solo indexador en modo watch
- `npm run web` → Solo web en modo dev
- `npm run web:preview` → Web con build de producción
- `npm run build` → Build completo para despliegue
- `npm run check` → Verificación de tipos

## Actualización automática

### Cómo funciona

1. **Indexador en modo watch** (`npm run index:watch`):
   - Vigila la carpeta de investigación cada 3 segundos
   - Detecta cambios en archivos `.md` y `.json`
   - Regenera el índice automáticamente
   - Muestra en consola: timestamp, duración y estadísticas

2. **Web con polling** (`POLL_INTERVAL_MS = 5000`):
   - Consulta el índice cada 5 segundos
   - Detecta cambios comparando `generatedAt`
   - Muestra hora de última actualización en el header
   - No requiere recargar la página manualmente

### Limitaciones conocidas

- **Windows**: El modo watch usa polling (no fs.watch nativo) para máxima compatibilidad
- **Rendimiento**: En carpetas con miles de archivos, el polling puede consumir CPU. Considera usar modo manual en ese caso.
- **WSL**: Funciona correctamente tanto en Windows nativo como en WSL
- **Red**: La web sólo es accesible desde localhost (127.0.0.1) por seguridad

## Actualización manual desde la UI

Cuando ejecutas `npm run dev`, el indexador expone una API local que permite reindexar manualmente desde el navegador.

### Configuración del puerto API

Por defecto, la API del indexador usa el puerto **3456**. Puedes cambiarlo:

```bash
# Linux/Mac
INDEXER_API_PORT=8080 npm run dev

# Windows PowerShell
$env:INDEXER_API_PORT = "8080"
npm run dev

# Windows CMD
set INDEXER_API_PORT=8080
npm run dev
```

La web detecta automáticamente el puerto configurado.

### Botón "Actualizar datos"

En el header del visor aparece un botón de actualización:

**Cuando la API está disponible:**
- `🔄 Actualizar datos` → Listo para actualizar
- `⏳ Actualizando...` → Reindexación en progreso  
- `✅ Actualizado` → Éxito (muestra duración y estadísticas)
- `❌ Error` → Fallo con mensaje descriptivo

**Cuando la API NO está disponible:**
- `⚠️ API no disponible` → Botón deshabilitado
- Muestra hint: *"Ejecuta `npm run index:watch` para habilitar"*

### Estados visuales claros

- **Indicador en header:**
  - `●` → Última actualización fue automática (polling cada 5s)
  - `🔄` → Última actualización fue manual (botón)
  
- **Mensajes de éxito:** Muestran duración y número de líneas indexadas
- **Mensajes de error:** Descriptivos y accionables
  - *"El indexador está ocupado. Inténtalo en unos segundos."*
  - *"No se pudo conectar al indexador en http://127.0.0.1:3456. ¿Está ejecutándose 'npm run index:watch'?"*
  - *"Tiempo de espera agotado (30s). El índice puede ser muy grande."*

### API del indexador

Cuando está en modo watch, el indexador expone:

```bash
# Estado actual del índice
GET http://127.0.0.1:3456/api/status

# Disparar reindexación manual
POST http://127.0.0.1:3456/api/reindex
```

**Respuesta de éxito:**
```json
{
  "status": "success",
  "duration": 45,
  "generatedAt": "2026-04-15T10:30:00.000Z",
  "stats": { "lineCount": 3, "entryCount": 4, ... }
}
```

**Respuesta de ocupado:**
```json
{
  "status": "busy",
  "message": "Indexing already in progress"
}
```

### Convivencia automática + manual

El sistema gestiona correctamente la concurrencia:

- **Polling automático** (cada 5s): Detecta cambios sin interferir con operaciones manuales
- **Reindexación manual**: Se ejecuta inmediatamente; si el indexador está ocupado, devuelve error claro
- **Prevención de conflictos visuales**: El estado "success" del botón persiste hasta que el usuario interactúa de nuevo
- **Detección de API**: La web verifica cada 10s si la API está disponible y adapta la UI

## Gestión de líneas desde la UI

Puedes organizar las líneas de investigación directamente desde el visor sin borrar datos del disco.

### Estados visuales

Cada línea puede tener uno de estos estados visuales:

- **Activa** → Visible en la vista principal (por defecto)
- **Oculta** → No aparece en la vista principal pero sigue existiendo
- **Archivada** → Movida a una sección separada de archivadas

**Importante:** Estos estados solo afectan a la visualización en el visor. No se borran ni modificifican las carpetas de `research/`.

### Acciones disponibles

En cada tarjeta de línea encontrarás botones según el estado actual:

| Estado Actual | Acciones disponibles |
|---------------|---------------------|
| Activa | 👁️ **Ocultar** - Oculta de la vista principal |
| Activa | 📦 **Archivar** - Mueve a archivadas |
| Oculta | 🔄 **Restaurar** - Vuelve a activa |
| Oculta | 📦 **Archivar** - Mueve a archivadas |
| Archivada | 🔄 **Restaurar** - Vuelve a activa |

### Tabs de visualización

En la pantalla principal hay tres tabs para filtrar líneas:

- **Activas** (n) - Líneas visibles por defecto
- **Archivadas** (n) - Líneas archivadas
- **Ocultas** (n) - Líneas ocultas

### Persistencia

El estado visual se guarda en:
```
data/generated/ui-state.json
```

Este archivo:
- Se mantiene independiente del índice generado
- No se borra al reindexar
- Se limpia automáticamente de líneas que ya no existen
- Se reaplica cuando una línea reaparece con el mismo slug

## Arranque automático con systemd (Ubuntu/Linux)

Para que el visor inicie automáticamente al arrancar Ubuntu:

### Instalación rápida

```bash
# Desde el directorio del repositorio
bash install-systemd.sh
```

Este script detectará tu configuración y creará el servicio automáticamente.

### Instalación manual

1. **Crear archivo de servicio:**

```bash
sudo nano /etc/systemd/system/visor-investigaciones.service
```

2. **Contenido (ajusta las rutas):**

```ini
[Unit]
Description=VisorInvestigaciones
After=network.target

[Service]
Type=simple
User=pedro
WorkingDirectory=/home/pedro/VisorInvestigaciones
Environment="RESEARCH_PATH=/home/pedro/.openclaw/workspace/research"
Environment="INDEXER_API_PORT=3456"
ExecStart=/home/pedro/VisorInvestigaciones/start-visor.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. **Activar e iniciar:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable visor-investigaciones
sudo systemctl start visor-investigaciones
```

### Comandos útiles

```bash
# Ver estado
sudo systemctl status visor-investigaciones

# Ver logs en tiempo real
sudo journalctl -u visor-investigaciones -f

# Reiniciar
sudo systemctl restart visor-investigaciones

# Detener
sudo systemctl stop visor-investigaciones
```

### API de gestión de líneas

```bash
# Obtener estado UI
GET http://127.0.0.1:3456/api/ui-state

# Cambiar estado visual de una línea
POST http://127.0.0.1:3456/api/lines/{lineSlug}/status
Body: { "status": "archived" }  // "active", "hidden", o "archived"
```

### Fallback manual

Si el modo automático falla o necesitas control total:

```bash
# Terminal 1: Vigilar cambios manualmente
npm run index:watch

# Terminal 2: Web normal
npm run web
```

O simplemente usa el modo manual:
```bash
npm run index   # cuando quieras actualizar
npm run web     # en otra terminal
```

## Que incluye la V1

- lectura de `RESEARCH_PATH` con fallback automatico a `data/sample/research`
- soporte simultaneo de formato legado y formato estructurado futuro
- normalizacion a un unico indice JSON consumido por la UI
- listado de lineas de investigacion
- vista de linea con estrategia, fuentes, hallazgos, acciones y timeline
- detalle de entrada con resumen, hallazgos, acciones, fuentes y artefactos
- busqueda basica
- filtros basicos por formato, estado, prioridad y año
- deteccion basica de temas repetidos o similares mediante heuristicas de tokens

## Verificacion minima

```bash
npm run check
npm run build
```

## Delicados encapsulados

- el parseo markdown legado es pragmatico y esta aislado en `tools/indexer/src/index.ts`
- la heuristica de temas repetidos tambien esta encapsulada en el indexador para poder sustituirla mas adelante
- el contrato exacto del formato estructurado puede endurecerse cuando Gema produzca `line.json`, `entry.json`, `findings.json` y `actions.json` de forma estable

Mas detalle en `docs/decisions.md`.
