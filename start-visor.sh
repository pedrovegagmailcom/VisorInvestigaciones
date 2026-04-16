#!/bin/bash
# Script de inicio para VisorInvestigaciones
# Usado por el servicio systemd

# Cargar nvm si existe
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Verificar que npm está disponible
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm no encontrado. Asegúrate de tener Node.js instalado."
    exit 1
fi

# Ir al directorio del proyecto
cd "$(dirname "$0")" || exit 1

echo "🚀 Iniciando VisorInvestigaciones..."
echo "📂 Directorio: $(pwd)"
echo "🔧 Node: $(node --version)"
echo "📦 npm: $(npm --version)"
echo "📁 Research path: ${RESEARCH_PATH:-data/sample/research}"
echo ""

# Iniciar en modo desarrollo (con watch)
npm run dev
