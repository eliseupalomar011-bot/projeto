const { getDb } = require("../database/db");
const bcrypt = require("bcryptjs");
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

async function listUsers() {
  const db = await getDb();
  const rows = await db.all(
    `SELECT u.*, c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     ORDER BY u.name ASC`
  );
  return rows.map((row) => ({ ...publicUser(row), companyName: row.company_name }));
}

async function me(userId) {
  const db = await getDb();
  const user = await db.get("SELECT * FROM users WHERE id = ?", userId);
  return publicUser(user);
}

async function createUserByAdmin(actorUserId, payload) {
  const { name, username, password, companyName, role = "user", balance = 0 } = payload;
  if (!name || !username || !password) throw new HttpError(400, "Nome, usuario e senha sao obrigatorios.");
  if (password.length < 6) throw new HttpError(400, "A senha deve ter pelo menos 6 caracteres.");
  if (!["admin", "user"].includes(role)) throw new HttpError(400, "Perfil invalido.");

  const db = await getDb();
  const normalizedUsername = normalizeUsername(username);
  validateUsername(normalizedUsername);
  const existing = await db.get("SELECT id FROM users WHERE username = ?", normalizedUsername);
  if (existing) throw new HttpError(409, "Usuario ja cadastrado.");

  let companyId = null;
  if (companyName?.trim()) {
    await db.run("INSERT OR IGNORE INTO companies (name) VALUES (?)", companyName.trim());
    const company = await db.get("SELECT id FROM companies WHERE name = ?", companyName.trim());
    companyId = company.id;
  }

  const hash = await bcrypt.hash(password, 12);
  const generatedEmail = `${normalizedUsername}@local.ets2`;
  const result = await db.run(
    `INSERT INTO users (name, username, email, password_hash, role, balance, company_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    name.trim(),
    normalizedUsername,
    generatedEmail,
    hash,
    role,
    Number(balance || 0),
    companyId
  );

  const user = await db.get("SELECT * FROM users WHERE id = ?", result.lastID);
  await logActivity({
    actorUserId,
    targetUserId: user.id,
    type: "admin.user.created",
    message: `Admin criou usuario ${user.username}.`,
    metadata: { role, balance: Number(balance || 0), companyName: companyName || null }
  });

  return getUserWithCompany(user.id);
}

async function getUserWithCompany(userId) {
  const db = await getDb();
  const row = await db.get(
    `SELECT u.*, c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE u.id = ?`,
    userId
  );
  return row ? { ...publicUser(row), companyName: row.company_name } : null;
}

async function updateUserByAdmin(actorUserId, userId, payload) {
  const { name, username, password, companyName, role = "user", balance = 0 } = payload;
  if (!name || !username) throw new HttpError(400, "Nome e usuario sao obrigatorios.");
  if (!["admin", "user"].includes(role)) throw new HttpError(400, "Perfil invalido.");
  if (password && password.length < 6) throw new HttpError(400, "A senha deve ter pelo menos 6 caracteres.");

  const db = await getDb();
  const current = await db.get("SELECT * FROM users WHERE id = ?", userId);
  if (!current) throw new HttpError(404, "Usuario nao encontrado.");

  const normalizedUsername = normalizeUsername(username);
  validateUsername(normalizedUsername);
  const duplicate = await db.get("SELECT id FROM users WHERE username = ? AND id != ?", normalizedUsername, userId);
  if (duplicate) throw new HttpError(409, "Usuario ja cadastrado em outro usuario.");
  const generatedEmail = current.email;

  let companyId = null;
  if (companyName?.trim()) {
    await db.run("INSERT OR IGNORE INTO companies (name) VALUES (?)", companyName.trim());
    const company = await db.get("SELECT id FROM companies WHERE name = ?", companyName.trim());
    companyId = company.id;
  }

  if (password) {
    const hash = await bcrypt.hash(password, 12);
    await db.run(
      `UPDATE users
       SET name = ?, username = ?, email = ?, password_hash = ?, role = ?, balance = ?, company_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      name.trim(),
      normalizedUsername,
      generatedEmail,
      hash,
      role,
      Number(balance || 0),
      companyId,
      userId
    );
  } else {
    await db.run(
      `UPDATE users
       SET name = ?, username = ?, email = ?, role = ?, balance = ?, company_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      name.trim(),
      normalizedUsername,
      generatedEmail,
      role,
      Number(balance || 0),
      companyId,
      userId
    );
  }

  await logActivity({
    actorUserId,
    targetUserId: userId,
    type: "admin.user.updated",
    message: `Admin editou usuario ${normalizedUsername}.`,
    metadata: { role, balance: Number(balance || 0), companyName: companyName || null }
  });

  return getUserWithCompany(userId);
}

async function deleteUserByAdmin(actorUserId, userId) {
  if (actorUserId === userId) throw new HttpError(409, "Voce nao pode excluir o proprio usuario logado.");

  const db = await getDb();
  const current = await db.get("SELECT * FROM users WHERE id = ?", userId);
  if (!current) throw new HttpError(404, "Usuario nao encontrado.");

  await db.run("BEGIN");
  try {
    const freights = await db.all("SELECT id FROM freights WHERE user_id = ?", userId);
    const freightIds = freights.map((freight) => freight.id);

    await db.run("UPDATE activity_logs SET actor_user_id = NULL WHERE actor_user_id = ?", userId);
    await db.run("UPDATE activity_logs SET target_user_id = NULL WHERE target_user_id = ?", userId);

    for (const freightId of freightIds) {
      await db.run("UPDATE activity_logs SET freight_id = NULL WHERE freight_id = ?", freightId);
      await db.run("DELETE FROM delivery_notes WHERE freight_id = ?", freightId);
      await db.run("DELETE FROM telemetry_events WHERE freight_id = ?", freightId);
    }

    await db.run("DELETE FROM telemetry_events WHERE user_id = ?", userId);
    await db.run("DELETE FROM delivery_notes WHERE user_id = ?", userId);
    await db.run("DELETE FROM freights WHERE user_id = ?", userId);
    await db.run("DELETE FROM users WHERE id = ?", userId);
    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK");
    throw error;
  }

  await logActivity({
    actorUserId,
    type: "admin.user.deleted",
    message: `Admin excluiu usuario ${current.username}.`,
    metadata: { deletedUserId: userId, username: current.username }
  });

  return { deleted: true, id: userId };
}

async function setTruckLock(actorUserId, userId, locked) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM users WHERE id = ?", userId);
  if (!current) throw new HttpError(404, "Usuario nao encontrado.");
  if (current.role === "admin") throw new HttpError(409, "Bloqueio de caminhao e apenas para motoristas.");

  await db.run("UPDATE users SET truck_locked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", locked ? 1 : 0, userId);
  await logActivity({
    actorUserId,
    targetUserId: userId,
    type: locked ? "truck.locked" : "truck.unlocked",
    message: `Admin ${locked ? "bloqueou" : "desbloqueou"} o caminhao de ${current.username}.`,
    metadata: { locked: Boolean(locked) }
  });
  return getUserWithCompany(userId);
}

module.exports = { listUsers, me, createUserByAdmin, updateUserByAdmin, deleteUserByAdmin, setTruckLock };
