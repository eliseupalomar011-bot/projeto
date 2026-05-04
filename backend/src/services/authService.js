const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("../database/db");
const config = require("../config");
const { HttpError } = require("../utils/httpError");
const { publicUser } = require("../utils/serialize");
const { logActivity } = require("./logService");

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validateUsername(username) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new HttpError(400, "Usuario deve ter 3 a 32 caracteres e usar apenas letras, numeros, ponto, traco ou underline.");
  }
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

async function register({ name, username, password, companyName }) {
  if (!name || !username || !password) throw new HttpError(400, "Nome, usuario e senha sao obrigatorios.");
  if (password.length < 6) throw new HttpError(400, "A senha deve ter pelo menos 6 caracteres.");
  const normalizedUsername = normalizeUsername(username);
  validateUsername(normalizedUsername);

  const db = await getDb();
  const existing = await db.get("SELECT id FROM users WHERE username = ?", normalizedUsername);
  if (existing) throw new HttpError(409, "Usuario ja cadastrado.");

  let companyId = null;
  if (companyName) {
    await db.run("INSERT OR IGNORE INTO companies (name) VALUES (?)", companyName.trim());
    const company = await db.get("SELECT id FROM companies WHERE name = ?", companyName.trim());
    companyId = company.id;
  }

  const hash = await bcrypt.hash(password, 12);
  const generatedEmail = `${normalizedUsername}@local.ets2`;
  const result = await db.run(
    `INSERT INTO users (name, username, email, password_hash, company_id)
     VALUES (?, ?, ?, ?, ?)`,
    name.trim(),
    normalizedUsername,
    generatedEmail,
    hash,
    companyId
  );
  const user = await db.get("SELECT * FROM users WHERE id = ?", result.lastID);
  await logActivity({ actorUserId: user.id, targetUserId: user.id, type: "user.registered", message: `Usuario ${user.username} cadastrado.` });
  return { user: publicUser(user), token: signToken(user) };
}

async function login({ username, email, password }) {
  const identifier = normalizeUsername(username || email);
  if (!identifier || !password) throw new HttpError(400, "Usuario e senha sao obrigatorios.");
  const db = await getDb();
  const user = await db.get("SELECT * FROM users WHERE username = ? OR email = ?", identifier, identifier);
  if (!user) throw new HttpError(401, "Credenciais invalidas.");

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, "Credenciais invalidas.");

  await logActivity({ actorUserId: user.id, targetUserId: user.id, type: "auth.login", message: `Login de ${user.username}.` });
  return { user: publicUser(user), token: signToken(user) };
}

module.exports = { register, login, signToken };
