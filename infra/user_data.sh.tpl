#!/bin/bash
set -euxo pipefail

dnf install -y docker
systemctl enable --now docker

mkdir -p /opt/grabmyseats
cat > /opt/grabmyseats/.env <<'EOF'
%{ for k, v in app_env }
${k}=${v}
%{ endfor }
EOF
chmod 600 /opt/grabmyseats/.env

cat > /opt/grabmyseats/Caddyfile <<EOF
${domain_name} {
  reverse_proxy backend:4000
}
EOF

cat > /opt/grabmyseats/docker-compose.yml <<EOF
version: "3.8"
services:
  backend:
    image: ${backend_image}
    restart: unless-stopped
    env_file: .env
    expose: ["4000"]
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [backend]
volumes:
  caddy_data:
EOF

curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

aws ecr get-login-password --region ${aws_region} | docker login --username AWS --password-stdin "$(echo ${backend_image} | cut -d/ -f1)"

cd /opt/grabmyseats
docker-compose pull || true   # first boot: image doesn't exist yet, that's expected — see step 3 below
docker-compose up -d || true
