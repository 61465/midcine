#!/bin/bash
# setup.sh — تثبيت LUFFY على سيرفر Ubuntu جديد
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}"
echo "  ██╗     ██╗   ██╗███████╗███████╗██╗   ██╗"
echo "  ██║     ██║   ██║██╔════╝██╔════╝╚██╗ ██╔╝"
echo "  ██║     ██║   ██║█████╗  █████╗   ╚████╔╝ "
echo "  ██║     ██║   ██║██╔══╝  ██╔══╝    ╚██╔╝  "
echo "  ███████╗╚██████╔╝██║     ██║        ██║   "
echo "  ╚══════╝ ╚═════╝ ╚═╝     ╚═╝        ╚═╝   "
echo -e "  Hosting Server — بيئة استضافة كاملة${NC}"
echo ""

# ── 1. تحديث النظام ──────────────────────────────────────────────
echo -e "${YELLOW}[1/6] Updating system...${NC}"
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. تثبيت Docker ──────────────────────────────────────────────
echo -e "${YELLOW}[2/6] Installing Docker...${NC}"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed ✓"
fi

# ── 3. تثبيت أدوات مساعدة ────────────────────────────────────────
echo -e "${YELLOW}[3/6] Installing tools...${NC}"
apt-get install -y -qq ufw fail2ban htop curl wget git apache2-utils

# ── 4. إعداد Firewall ────────────────────────────────────────────
echo -e "${YELLOW}[4/6] Configuring firewall...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "  Firewall configured ✓"

# ── 5. إنشاء ملفات Traefik ───────────────────────────────────────
echo -e "${YELLOW}[5/6] Preparing Traefik...${NC}"
touch /opt/luffy/traefik/acme.json
chmod 600 /opt/luffy/traefik/acme.json

# ── 6. رفع LUFFY ─────────────────────────────────────────────────
echo -e "${YELLOW}[6/6] Starting LUFFY...${NC}"
cd /opt/luffy
docker compose up -d --build

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ LUFFY جاهز!${NC}"
echo ""
echo "  🌐 Bot:       https://bot.YOUR_DOMAIN"
echo "  📊 Portainer: https://portainer.YOUR_DOMAIN"
echo "  🔀 Traefik:   https://traefik.YOUR_DOMAIN"
echo ""
echo "  📋 Logs:    docker compose logs -f"
echo "  🔄 Restart: docker compose restart"
echo -e "${GREEN}════════════════════════════════════════${NC}"
