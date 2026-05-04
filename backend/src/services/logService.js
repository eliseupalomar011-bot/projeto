const { getDb } = require("../database/db");

async function logActivity({ actorUserId = null, targetUserId = null, freightId = null, type, message, metadata = null }) {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO activity_logs (actor_user_id, target_user_id, freight_id, type, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    actorUserId,
    targetUserId,
    freightId,
    type,
    message,
    metadata ? JSON.stringify(metadata) : null
  );

  return db.get("SELECT * FROM activity_logs WHERE id = ?", result.lastID);
}

async function listLogs(limit = 100) {
  const db = await getDb();
  return db.all(
    `SELECT l.*, a.username AS actor_username, t.username AS target_username
     FROM activity_logs l
     LEFT JOIN users a ON a.id = l.actor_user_id
     LEFT JOIN users t ON t.id = l.target_user_id
     ORDER BY l.id DESC
     LIMIT ?`,
    limit
  );
}

module.exports = { logActivity, listLogs };
