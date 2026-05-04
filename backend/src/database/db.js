const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcryptjs");
const config = require("../config");

let db;

async function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  db = await open({
    filename: config.databaseFile,
    driver: sqlite3.Database
  });
  await db.exec("PRAGMA foreign_keys = ON");
  const schema = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");
  await db.exec(schema);
  await migrateUsersUsername();
  await migrateTruckLock();
  await removeLegacyAdmin();
  await ensureDefaultAdmin();
  return db;
}

function usernameFrom(value, fallback) {
  const base = String(value || fallback || "usuario")
    .split("@")[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 28);
  return base || "usuario";
}

async function migrateUsersUsername() {
  const columns = await db.all("PRAGMA table_info(users)");
  const hasUsername = columns.some((column) => column.name === "username");
  if (!hasUsername) await db.run("ALTER TABLE users ADD COLUMN username TEXT");

  const users = await db.all("SELECT id, name, email, username FROM users ORDER BY id ASC");
  const used = new Set(users.filter((user) => user.username).map((user) => user.username));

  for (const user of users) {
    if (user.username) continue;
    const seed = usernameFrom(user.email, user.name);
    let username = seed;
    let suffix = 1;
    while (used.has(username)) {
      username = `${seed}${suffix}`;
      suffix += 1;
    }
    used.add(username);
    await db.run("UPDATE users SET username = ? WHERE id = ?", username, user.id);
  }

  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
}

async function migrateTruckLock() {
  const columns = await db.all("PRAGMA table_info(users)");
  const hasTruckLocked = columns.some((column) => column.name === "truck_locked");
  if (!hasTruckLocked) await db.run("ALTER TABLE users ADD COLUMN truck_locked INTEGER NOT NULL DEFAULT 0");
}

async function removeLegacyAdmin() {
  if (config.adminEmail === "admin@ets2.local") return;
  const legacy = await db.get("SELECT id FROM users WHERE email = ?", "admin@ets2.local");
  if (!legacy) return;

  const assignedFreights = await db.get("SELECT COUNT(*) AS total FROM freights WHERE user_id = ?", legacy.id);
  if (assignedFreights.total > 0) return;

  await db.run("UPDATE activity_logs SET actor_user_id = NULL WHERE actor_user_id = ?", legacy.id);
  await db.run("UPDATE activity_logs SET target_user_id = NULL WHERE target_user_id = ?", legacy.id);
  await db.run("DELETE FROM users WHERE id = ?", legacy.id);
}

async function ensureDefaultAdmin() {
  const existing = await db.get("SELECT id FROM users WHERE username = ? OR email = ?", config.adminUsername, config.adminEmail);
  if (existing) {
    await db.run("UPDATE users SET username = ?, email = ? WHERE id = ?", config.adminUsername, config.adminEmail, existing.id);
    return;
  }

  const hash = await bcrypt.hash(config.adminPassword, 12);
  await db.run(
    "INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
    config.adminName,
    config.adminUsername,
    config.adminEmail,
    hash
  );
}

module.exports = { getDb };
