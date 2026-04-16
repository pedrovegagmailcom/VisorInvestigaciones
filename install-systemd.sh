#!/bin/bash
# Script de instalación del servicio systemd para VisorInvestigaciones
# Ejecutar: bash install-systemd.sh

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuración
SERVICE_NAME="visor-investigaciones"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
REPO_PATH="$(cd "$(dirname "$0")" && pwd)"
USER=$(whoami)
HOME_DIR="$HOME"

# Detectar ruta de investigación
if [ -d "$HOME/.openclaw/workspace/research" ]; then
    RESEARCH_PATH="$HOME/.openclaw/workspace/research"
    echo -e "${GREEN}✓ Detectada ruta de investigación:${NC} $RESEARCH_PATH"
else
    RESEARCH_PATH="$REPO_PATH/data/sample/research"
    echo -e "${YELLOW}⚠ No se encontró research en ~/.openclaw/workspace/research${NC}"
    echo -e "${YELLOW}  Usando datos de ejemplo:${NC} $RESEARCH_PATH"
    echo -e "${YELLOW}  Para cambiarlo, edita:${NC} sudo systemctl edit $SERVICE_NAME"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Instalación de VisorInvestigaciones (systemd)"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📂 Repositorio: $REPO_PATH"
echo "👤 Usuario: $USER"
echo "🏠 Home: $HOME_DIR"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "$REPO_PATH/package.json" ]; then
    echo -e "${RED}❌ Error: No se encontró package.json${NC}"
    echo "Asegúrate de ejecutar este script desde el directorio del repositorio."
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js no está instalado${NC}"
    echo "Instálalo primero: https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm no está instalado${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js detectado:${NC} $(node --version)"
echo -e "${GREEN}✓ npm detectado:${NC} $(npm --version)"
echo ""

# Hacer ejecutable el script de inicio
chmod +x "$REPO_PATH/start-visor.sh"

# Crear archivo de servicio
echo "📝 Creando servicio systemd..."

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=VisorInvestigaciones - Visor de investigacion local
Documentation=https://github.com/pedrovegagmailcom/VisorInvestigaciones
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_PATH

# Variables de entorno
Environment="RESEARCH_PATH=$RESEARCH_PATH"
Environment="INDEXER_API_PORT=3456"
Environment="NODE_ENV=production"
Environment="NVM_DIR=$HOME_DIR/.nvm"
Environment="PATH=/usr/local/bin:/usr/bin:/bin:$HOME_DIR/.nvm/versions/node/$(node --version 2>/dev/null || echo 'v20.0.0')/bin"

# Script de inicio
ExecStart=$REPO_PATH/start-visor.sh

# Reinicio automatico
Restart=on-failure
RestartSec=10
StartLimitInterval=60s
StartLimitBurst=3

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=visor-investigaciones

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Servicio creado:${NC} $SERVICE_FILE"
echo ""

# Recargar systemd
echo "🔄 Recargando systemd..."
sudo systemctl daemon-reload

# Habilitar servicio
echo "✅ Habilitando servicio para arranque automático..."
sudo systemctl enable "$SERVICE_NAME"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Instalación completada"
echo "═══════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}✅ Servicio instalado correctamente${NC}"
echo ""
echo "Comandos disponibles:"
echo ""
echo "  ${YELLOW}Iniciar ahora:${NC}"
echo "    sudo systemctl start $SERVICE_NAME"
echo ""
echo "  ${YELLOW}Ver estado:${NC}"
echo "    sudo systemctl status $SERVICE_NAME"
echo ""
echo "  ${YELLOW}Ver logs en tiempo real:${NC}"
echo "    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "  ${YELLOW}Ver logs recientes:${NC}"
echo "    sudo journalctl -u $SERVICE_NAME --since '1 hour ago'"
echo ""
echo "  ${YELLOW}Reiniciar:${NC}"
echo "    sudo systemctl restart $SERVICE_NAME"
echo ""
echo "  ${YELLOW}Detener:${NC}"
echo "    sudo systemctl stop $SERVICE_NAME"
echo ""
echo "  ${YELLOW}Deshabilitar arranque automático:${NC}"
echo "    sudo systemctl disable $SERVICE_NAME"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""

# Preguntar si iniciar ahora
read -p "¿Iniciar el servicio ahora? (s/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "🚀 Iniciando VisorInvestigaciones..."
    sudo systemctl start "$SERVICE_NAME"
    sleep 2
    echo ""
    echo "📊 Estado del servicio:"
    sudo systemctl status "$SERVICE_NAME" --no-pager
    echo ""
    echo -e "${GREEN}🌐 El visor está disponible en:${NC} http://localhost:5173"
    echo ""
    echo "Para ver logs: sudo journalctl -u $SERVICE_NAME -f"
fi
