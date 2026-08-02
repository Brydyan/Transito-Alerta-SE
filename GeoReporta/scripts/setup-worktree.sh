#!/usr/bin/env bash
# scripts/setup-worktree.sh
#
# Configura un nuevo git worktree enlazando simbólicamente los archivos no versionados
# (.env y credenciales de Firebase) desde el worktree principal.
#
# Uso: ./scripts/setup-worktree.sh

set -euo pipefail

# Colores para la terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Inicializando configuración del Worktree ===${NC}\n"

# 1. Verificar si estamos en un repositorio Git
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo -e "${RED}✗ Error: No estás dentro de un repositorio Git.${NC}"
  exit 1
fi

# Directorio del worktree actual
CURRENT_DIR="$(pwd)"

# 2. Obtener el directorio .git común (apunta al worktree principal)
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
MAIN_DIR="$(cd "$GIT_COMMON_DIR/.." && pwd)"

# 3. Validar si ya estamos en el worktree principal
if [ "$CURRENT_DIR" -ef "$MAIN_DIR" ]; then
  echo -e "${YELLOW}⚠ Advertencia: Estás en el worktree principal (${MAIN_DIR}).${NC}"
  echo "No es necesario enlazar archivos aquí."
  exit 0
fi

echo -e "Worktree principal detectado en: ${YELLOW}${MAIN_DIR}${NC}"
echo -e "Worktree secundario actual: ${YELLOW}${CURRENT_DIR}${NC}\n"

# 4. Enlazar archivo .env
MAIN_ENV="${MAIN_DIR}/.env"
CURRENT_ENV="${CURRENT_DIR}/.env"

if [ -f "$MAIN_ENV" ]; then
  if [ -L "$CURRENT_ENV" ] || [ -f "$CURRENT_ENV" ]; then
    echo -e "${YELLOW}⚠ El archivo .env ya existe en este worktree. Omitiendo enlace...${NC}"
  else
    ln -sf "$MAIN_ENV" "$CURRENT_ENV"
    echo -e "${GREEN}✓ Enlace simbólico creado para .env${NC}"
  fi
else
  echo -e "${RED}✗ Error: No se encontró el archivo .env en el worktree principal (${MAIN_ENV}).${NC}"
  echo "Por favor, crea el archivo .env en el principal antes de correr este script."
  exit 1
fi

# 5. Enlazar credenciales de Firebase
MAIN_STORAGE="${MAIN_DIR}/backend/storage"
CURRENT_STORAGE="${CURRENT_DIR}/backend/storage"

# Crear directorio de storage si no existe por alguna razón
mkdir -p "${CURRENT_STORAGE}"

# Buscar archivos *firebase*.json en el principal
firebase_files=($(find "$MAIN_STORAGE" -maxdepth 1 -name "*firebase*.json" 2>/dev/null || true))

if [ ${#firebase_files[@]} -gt 0 ]; then
  for file in "${firebase_files[@]}"; do
    basename_file="$(basename "$file")"
    current_file_path="${CURRENT_STORAGE}/${basename_file}"

    if [ -L "$current_file_path" ] || [ -f "$current_file_path" ]; then
      echo -e "${YELLOW}⚠ El archivo ${basename_file} ya existe en el storage actual. Omitiendo...${NC}"
    else
      ln -sf "$file" "$current_file_path"
      echo -e "${GREEN}✓ Enlace simbólico creado para backend/storage/${basename_file}${NC}"
    fi
  done
else
  echo -e "${YELLOW}⚠ No se encontraron credenciales de Firebase (*firebase*.json) en el storage del principal.${NC}"
fi

# 6. Siguiente pasos recomendados
echo -e "\n${GREEN}=== Setup completado con éxito ===${NC}"
echo "Ahora podés correr los siguientes comandos para levantar el entorno:"
echo -e "  ${YELLOW}cd frontend && npm install${NC}"
echo -e "  ${YELLOW}cd ../backend && composer install && php artisan key:generate --show${NC} (si hace falta)"
echo -e "  ${YELLOW}docker compose up -d${NC} (compartirá la infra levantada, o chequear puertos con ./scripts/check-port-collision.sh)"
