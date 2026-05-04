# Deploy

## VPS com PM2

```bash
git clone <repo>
cd ets2-freight-system
cp backend/.env.example backend/.env
nano backend/.env
npm install --workspace backend --omit=dev
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

Use Nginx como proxy reverso para `http://127.0.0.1:5000` com suporte a WebSocket (caso use Gunicorn/Eventlet):

```nginx
location / {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

## Docker

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

### 4. PythonAnywhere

O backend foi reescrito em Python (Flask) e usa `Flask-SocketIO` em modo de "polling". Isso significa que ele rodará perfeitamente nas contas gratuitas do PythonAnywhere sem precisar de servidores ASGI ou permissões especiais.

Basta fazer o upload da pasta `backend-python`, criar um Web App Flask no painel deles e apontar o arquivo WSGI para o `app.py`.
