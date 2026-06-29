#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  02_deploy.sh — نشر / تحديث كل المشاريع
#  الاستخدام: bash 02_deploy.sh
# ══════════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
BASE_DIR="$(dirname "$SERVER_DIR")"

echo ""
echo "══════════════════════════════════════════════"
echo "  Game Zone Server — Deploy"
echo "  Base dir: $BASE_DIR"
echo "══════════════════════════════════════════════"

# ── التحقق من وجود .env ───────────────────────────────────────────
if [ ! -f "$SERVER_DIR/.env" ]; then
    echo "ERROR: $SERVER_DIR/.env not found!"
    echo "  cp $SERVER_DIR/.env.example $SERVER_DIR/.env && nano $SERVER_DIR/.env"
    exit 1
fi

# ── 1. تحديث المستودعات العامة ───────────────────────────────────
echo "[1/5] Pulling latest from public repos..."
for repo in golden chat news archive; do
    if [ -d "$BASE_DIR/$repo/.git" ]; then
        git -C "$BASE_DIR/$repo" pull --quiet && echo "  ✓ $repo"
    fi
done

# ── 2. بناء Sport App (Vite/React) ────────────────────────────────
if [ -d "$BASE_DIR/sport-app" ]; then
    echo "[2/5] Building sport-app..."
    cd "$BASE_DIR/sport-app"
    npm ci --silent
    npm run build --silent
    mkdir -p "$SERVER_DIR/static/sport"
    cp -r dist/. "$SERVER_DIR/static/sport/"
    echo "  ✓ sport-app built → static/sport/"
else
    echo "[2/5] sport-app not found, skipping."
fi

# ── 3. نسخ ملفات Game Zone الثابتة ──────────────────────────────
echo "[3/5] Copying Game Zone static files..."
mkdir -p "$SERVER_DIR/static/gamezone/chat"
mkdir -p "$SERVER_DIR/static/gamezone/news"
mkdir -p "$SERVER_DIR/static/gamezone/archive"

# golden كصفحة رئيسية
if [ -d "$BASE_DIR/golden" ]; then
    cp -r "$BASE_DIR/golden/." "$SERVER_DIR/static/gamezone/"
    echo "  ✓ golden → gamezone/"
fi
[ -d "$BASE_DIR/chat" ]    && cp -r "$BASE_DIR/chat/."    "$SERVER_DIR/static/gamezone/chat/"    && echo "  ✓ chat"
[ -d "$BASE_DIR/news" ]    && cp -r "$BASE_DIR/news/."    "$SERVER_DIR/static/gamezone/news/"    && echo "  ✓ news"
[ -d "$BASE_DIR/archive" ] && cp -r "$BASE_DIR/archive/." "$SERVER_DIR/static/gamezone/archive/" && echo "  ✓ archive"

# ── 4. تشغيل Docker Compose ─────────────────────────────────────
echo "[4/5] Starting Docker services..."
cd "$SERVER_DIR"
docker compose pull postgres --quiet
docker compose up --build -d
echo "  ✓ All containers started"

# ── 5. تهيئة قاعدة بيانات المطعم ───────────────────────────────
echo "[5/5] Setting up restaurant database..."
echo "  Waiting 15s for postgres to be ready..."
sleep 15
docker compose exec -T resto npx prisma db push --accept-data-loss 2>/dev/null \
    && echo "  ✓ Database schema applied" \
    || echo "  ⚠ Database migration: check manually with: docker compose exec resto npx prisma db push"

# ── الملخص ──────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "══════════════════════════════════════════════"
echo "  Deployment complete!"
echo ""
echo "  Game Zone:  http://$SERVER_IP/"
echo "  Chat:       http://$SERVER_IP/chat/"
echo "  News:       http://$SERVER_IP/news/"
echo "  Sport:      http://$SERVER_IP/sport/"
echo "  ARIA Bot:   http://$SERVER_IP/aria/"
echo "  Restaurant: http://$SERVER_IP/resto/"
echo ""
echo "  Logs: docker compose logs -f"
echo "══════════════════════════════════════════════"
