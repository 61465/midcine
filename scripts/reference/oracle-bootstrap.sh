#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  01_setup_oracle.sh — إعداد Oracle Cloud لأول مرة
#  شغّل هذا السكريبت مرة واحدة فقط بعد إنشاء الـ VPS
#  الاستخدام: bash 01_setup_oracle.sh
# ══════════════════════════════════════════════════════════════════
set -e

echo ""
echo "══════════════════════════════════════════════"
echo "  Game Zone Server — Oracle Cloud Setup"
echo "══════════════════════════════════════════════"
echo ""

# ── 1. تحديث النظام ───────────────────────────────────────────────
echo "[1/5] Updating system..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git unzip build-essential

# ── 2. تثبيت Docker ───────────────────────────────────────────────
echo "[2/5] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. NOTE: Log out and back in for group changes to take effect."
else
    echo "Docker already installed: $(docker --version)"
fi

# ── 3. تثبيت Node.js 20 (لبناء sport-app) ────────────────────────
echo "[3/5] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node: $(node --version) | npm: $(npm --version)"

# ── 4. إنشاء هيكل المجلدات ───────────────────────────────────────
echo "[4/5] Creating directory structure..."
sudo mkdir -p /opt/gamezone
sudo chown -R "$USER:$USER" /opt/gamezone
cd /opt/gamezone

# ── 5. استنساخ المشاريع العامة من GitHub ─────────────────────────
echo "[5/5] Cloning public repositories..."
[ ! -d golden ] && git clone https://github.com/61465/game-zone-golden.git golden || echo "golden: already cloned"
[ ! -d chat ]   && git clone https://github.com/61465/GAME-ZONE-CHAT.git chat      || echo "chat: already cloned"
[ ! -d news ]   && git clone https://github.com/61465/game-zone-news.git news      || echo "news: already cloned"
[ ! -d archive ] && git clone https://github.com/61465/game-zone-archive.git archive || echo "archive: already cloned"

echo ""
echo "══════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  الخطوات التالية:"
echo "  1. انقل المشاريع الخاصة من جهازك:"
echo ""
echo "     scp -r D:\\project\\ai       ubuntu@SERVER_IP:/opt/gamezone/ai"
echo "     scp -r D:\\project\\resturant ubuntu@SERVER_IP:/opt/gamezone/resturant"
echo "     scp -r D:\\project\\sport-app ubuntu@SERVER_IP:/opt/gamezone/sport-app"
echo "     scp -r D:\\project\\server    ubuntu@SERVER_IP:/opt/gamezone/server"
echo ""
echo "  2. أنشئ ملف .env:"
echo "     cp /opt/gamezone/server/.env.example /opt/gamezone/server/.env"
echo "     nano /opt/gamezone/server/.env"
echo ""
echo "  3. شغّل النشر:"
echo "     bash /opt/gamezone/server/scripts/02_deploy.sh"
echo "══════════════════════════════════════════════"
