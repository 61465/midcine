#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  03_ssl_setup.sh — إعداد شهادة SSL مجانية (Let's Encrypt)
#  يجب أن يكون لديك دومين يشير إلى IP السيرفر أولاً
#  الاستخدام: bash 03_ssl_setup.sh yourdomain.com your@email.com
# ══════════════════════════════════════════════════════════════════
set -e

DOMAIN="${1:-}"
EMAIL="${2:-}"
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: bash 03_ssl_setup.sh yourdomain.com your@email.com"
    exit 1
fi

echo "[1/3] Getting SSL certificate for $DOMAIN..."
docker run --rm \
    -v gz_letsencrypt_data:/etc/letsencrypt \
    -v gz_certbot_www:/var/www/certbot \
    -p 80:80 \
    certbot/certbot certonly \
    --standalone \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" -d "www.$DOMAIN"

echo "[2/3] Writing HTTPS nginx config..."
cat > "$SERVER_DIR/nginx/conf.d/default.conf" << NGINX
upstream aria_api  { server aria:9090; keepalive 32; }
upstream resto_app { server resto:3000; keepalive 16; }

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl;
    server_name $DOMAIN www.$DOMAIN;
    http2 on;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        root /var/www/gamezone;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
    location /chat/    { alias /var/www/gamezone/chat/;    try_files \$uri \$uri/ /chat/index.html; }
    location /news/    { alias /var/www/gamezone/news/;    try_files \$uri \$uri/ /news/index.html; }
    location /archive/ { alias /var/www/gamezone/archive/; try_files \$uri \$uri/ /archive/index.html; }
    location /sport/   { alias /var/www/sport/;            try_files \$uri \$uri/ /sport/index.html; }

    location /aria/ {
        proxy_pass http://aria_api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_buffering off;
        proxy_cache off;
    }

    location /resto {
        proxy_pass http://resto_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

echo "[3/3] Reloading nginx and starting certbot renewal..."
docker compose -f "$SERVER_DIR/docker-compose.yml" exec nginx nginx -s reload
docker compose -f "$SERVER_DIR/docker-compose.yml" --profile ssl up -d certbot

echo ""
echo "✅ SSL setup complete!"
echo "   https://$DOMAIN/"
echo "   https://$DOMAIN/aria/"
echo "   https://$DOMAIN/resto/"
