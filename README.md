# ETS2 Freight System

Sistema de gerenciamento de fretes para Euro Truck Simulator 2 com:

- Backend Node.js + Express + SQLite
- WebSocket em tempo real
- JWT
- Cliente desktop Electron
- Painel admin web
- Coleta de telemetria em `http://localhost:25555/api/ets2`

## Rodar localmente

```bash
cd backend-python
pip install -r requirements.txt
python run.py
```

Backend: `http://localhost:5000`

Admin: `http://localhost:5000/admin`

Cliente desktop:

```bash
npm run dev:client
```

## Login admin inicial

Defina no `backend/.env`:

```env
ADMIN_USERNAME=palomareliseuaz163
ADMIN_EMAIL=palomareliseuaz163@gmail.com
ADMIN_PASSWORD=mm06042012
```

O backend cria esse admin automaticamente ao iniciar.
No painel e no cliente, use o campo `Usuario`: `palomareliseuaz163`.

## Build .exe

```bash
npm run build:client
```

O instalador fica em `client/dist`.

## PythonAnywhere

O projeto foi atualizado para Python (Flask) usando Socket.IO com fallback para long-polling, o que o torna perfeitamente compatível com a hospedagem gratuita do PythonAnywhere usando um web app WSGI padrão.
