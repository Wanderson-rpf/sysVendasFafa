#!/usr/bin/env bash
# Gera os instaladores dentro de um container com Node 24 + Wine, a partir de qualquer Linux com Docker.
# O Wine permite gerar o instalador do WINDOWS (.exe) mesmo rodando no Linux.
#
# Uso:
#   ./scripts/dist-docker.sh            # Windows (.exe) + Linux (AppImage e .deb)
#   ./scripts/dist-docker.sh --win      # só Windows
#   ./scripts/dist-docker.sh --linux    # só Linux
#
# Saída: pasta release/
set -euo pipefail

# Tag fixada para o build ser reproduzível. Para atualizar, veja as tags em
# https://hub.docker.com/r/electronuserland/builder/tags?name=24-wine
IMAGEM="${IMAGEM:-electronuserland/builder:24-wine-05.26}"
ALVOS="${*:---linux --win}"

cd "$(dirname "$0")/.."
PROJETO="$(pwd)"
mkdir -p "$HOME/.cache/electron" "$HOME/.cache/electron-builder"

echo ">> Imagem: $IMAGEM"
echo ">> Alvos:  $ALVOS"

# - node_modules fica num volume próprio do Docker, para não misturar com o node_modules do host
#   (os binários do Electron/esbuild são diferentes entre Windows, Linux do host e o container).
# - Os caches do Electron e do electron-builder ficam no host: a partir do 2º build não baixa tudo de novo.
# - Roda como root (o volume do node_modules nasce do root) e no fim devolve dist/ e release/
#   ao seu usuário, para você conseguir apagar/mover sem sudo.
docker run --rm -t \
  -e ELECTRON_CACHE=/root/.cache/electron \
  -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
  -v "$PROJETO":/project \
  -v sysvendas-node-modules:/project/node_modules \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  -w /project \
  "$IMAGEM" \
  bash -c "npm ci --no-audit --no-fund \
    && npm run build \
    && npx electron-builder $ALVOS --publish never; \
    status=\$?; chown -R $(id -u):$(id -g) dist dist-electron release 2>/dev/null; exit \$status"

echo
echo ">> Pronto. Instaladores em: $PROJETO/release"
ls -lh release | grep -E '\.(exe|AppImage|deb)$' || true
