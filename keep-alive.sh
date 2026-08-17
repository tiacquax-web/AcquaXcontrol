#!/bin/bash
# Script que mantém o servidor Next.js sempre rodando
# Reinicia automaticamente se cair

APP_DIR="/home/user/webapp"
LOG="/tmp/next.log"
PORT=3000

while true; do
  # Verifica se está rodando
  if ! ss -tlnp | grep -q ":${PORT}"; then
    echo "[$(date)] Servidor caído, reiniciando..." >> /tmp/keepalive.log
    # Mata qualquer processo preso
    pkill -f "next dev" 2>/dev/null
    sleep 2
    cd "$APP_DIR"
    nohup node_modules/.bin/next dev -p $PORT > "$LOG" 2>&1 &
    echo "[$(date)] Iniciado PID=$!" >> /tmp/keepalive.log
    sleep 30  # Espera servidor subir
  fi
  sleep 10  # Checa a cada 10 segundos
done
