# Decisiones V1

## Decisiones tomadas

- El indexador soporta dos entradas reales: formato legado por carpetas planas y formato estructurado bajo `lines/`.
- El indice canonico se genera en `data/generated/index.json` y se replica en `web/public/data/generated/index.json` para que la UI pueda consumirlo sin backend.
- El parser legado es pragmatico: convierte listas markdown y parrafos en entidades normalizadas y sintetiza una entrada cronologica por linea para no perder timeline.
- La deteccion de temas repetidos es deliberadamente simple: usa terminos normalizados y bigramas frecuentes sobre hallazgos, acciones, entradas y fuentes.
- La UI usa `HashRouter` para funcionar bien en entorno local sin configurar rewrites.

## Encapsulado para revisar despues

- Las heuristicas de parseo markdown legado pueden enriquecerse si el formato real trae patrones mas consistentes.
- El contrato exacto de `findings.json`, `actions.json` y `entry.json` estructurados puede endurecerse cuando Gema empiece a emitirlos de forma estable.
- La deteccion de repeticion semantica esta aislada en el indexador para poder sustituirse por algo mas potente sin tocar la UI.
