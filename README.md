# ETS2 Freight Cloud System - v1.1.0 (Cloud Pro)

Sistema profissional de logística para Euro Truck Simulator 2, com banco de dados em nuvem, API dedicada e aplicativos independentes para Administrador e Motorista.

## 🏗️ Arquitetura do Sistema

- **Backend (API):** Flask (Python) hospedado no **PythonAnywhere**.
- **Banco de Dados:** PostgreSQL hospedado no **Supabase**.
- **Painel Admin:** Aplicativo Electron dedicado para gestão de frota.
- **Tablet Driver:** Aplicativo Electron (iPadOS style) para o motorista.

---

## 🛠️ Instalação e Configuração

### 1. Banco de Dados (Supabase)
1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute o conteúdo de `backend-python/database/schema.sql` para criar as tabelas.
3. Pegue sua **URI de Conexão** em *Settings > Database*.

### 2. Backend (PythonAnywhere)
1. Suba a pasta `backend-python` para o servidor.
2. Crie um arquivo `.env` na pasta do backend com:
   ```env
   DATABASE_URL=sua_uri_do_supabase_aqui
   JWT_SECRET=uma_chave_segura_aqui
   ```
3. Instale as dependências: `pip install -r requirements.txt`.
4. Configure o Web App WSGI para apontar para `app.py`.

### 3. Painel Admin (Gestor)
1. Entre na pasta `admin-app`.
2. Instale: `npm install`.
3. Rode: `npm start`.
4. Build (.exe): `npm run build`.

### 4. Tablet Driver (Motorista)
1. Entre na pasta `client`.
2. Instale: `npm install`.
3. Rode: `npm start`.
4. Build (.exe): `npm run build`.

---

## 🚀 Novidades da Versão 1.1.0
- **Independência total:** O Admin agora é um software separado do servidor.
- **Performance:** Uso de Socket.io para atualizações de frete em tempo real.
- **Segurança:** Autenticação via JWT e banco de dados isolado na nuvem.
- **Design Premium:** Nova interface Dark Mode com glassmorphism no painel admin.

---
**Desenvolvido por Eliseu Palomar Logistics** 🚛💨
