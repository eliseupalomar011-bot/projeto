const { getDb } = require("../database/db");
const { HttpError } = require("../utils/httpError");
const { freight: serializeFreight } = require("../utils/serialize");
const { logActivity } = require("./logService");

const FREIGHT_SELECT = `
  SELECT f.*, u.name AS user_name, u.username, u.email AS user_email, c.name AS company_name
  FROM freights f
  JOIN users u ON u.id = f.user_id
  LEFT JOIN companies c ON c.id = f.company_id
`;

async function getFreight(id) {
  const db = await getDb();
  const row = await db.get(`${FREIGHT_SELECT} WHERE f.id = ?`, id);
  return serializeFreight(row);
}

async function createFreight(actorUserId, payload) {
  const { origin, destination, cargo, value, userId, destinationLat, destinationLng } = payload;
  if (!origin || !destination || !cargo || !value || !userId) {
    throw new HttpError(400, "Origem, destino, carga, valor e usuario sao obrigatorios.");
  }

  const db = await getDb();
  const user = await db.get("SELECT id, company_id FROM users WHERE id = ?", userId);
  if (!user) throw new HttpError(404, "Usuario nao encontrado.");

  const result = await db.run(
    `INSERT INTO freights (origin, destination, cargo, value, user_id, company_id, destination_lat, destination_lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    origin.trim(),
    destination.trim(),
    cargo.trim(),
    Number(value),
    Number(userId),
    user.company_id,
    destinationLat === "" || destinationLat == null ? null : Number(destinationLat),
    destinationLng === "" || destinationLng == null ? null : Number(destinationLng)
  );

  const created = await getFreight(result.lastID);
  await logActivity({
    actorUserId,
    targetUserId: userId,
    freightId: created.id,
    type: "freight.created",
    message: `Frete #${created.id} criado para ${created.username}.`,
    metadata: created
  });
  return created;
}

async function listFreights({ userId = null, role = "user" } = {}) {
  const db = await getDb();
  const rows = role === "admin"
    ? await db.all(`${FREIGHT_SELECT} ORDER BY f.id DESC`)
    : await db.all(`${FREIGHT_SELECT} WHERE f.user_id = ? ORDER BY f.id DESC`, userId);
  return rows.map(serializeFreight);
}

async function acceptFreight(userId, freightId) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM freights WHERE id = ? AND user_id = ?", freightId, userId);
  if (!current) throw new HttpError(404, "Frete nao encontrado.");
  if (current.status !== "criado") throw new HttpError(409, "Apenas fretes criados podem ser aceitos.");

  await db.run(
    `UPDATE freights SET status = 'ativo', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    freightId
  );
  const updated = await getFreight(freightId);
  await logActivity({ actorUserId: userId, targetUserId: userId, freightId, type: "freight.accepted", message: `Frete #${freightId} aceito.` });
  return updated;
}

async function cancelFreight(actorUserId, freightId) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM freights WHERE id = ?", freightId);
  if (!current) throw new HttpError(404, "Frete nao encontrado.");
  if (["entregue", "falha", "cancelado"].includes(current.status)) {
    throw new HttpError(409, "Frete ja finalizado.");
  }

  await db.run(
    `UPDATE freights SET status = 'cancelado', failure_reason = 'Cancelado pelo admin', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    freightId
  );
  const updated = await getFreight(freightId);
  await logActivity({ actorUserId, targetUserId: current.user_id, freightId, type: "freight.cancelled", message: `Frete #${freightId} cancelado.` });
  return updated;
}

async function completeFreight(userId, freightId, noteData) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM freights WHERE id = ? AND user_id = ?", freightId, userId);
  if (!current || current.status !== "ativo") return null;

  await db.run("BEGIN");
  try {
    await db.run(
      `UPDATE freights SET status = 'entregue', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      freightId
    );
    await db.run("UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", current.value, userId);
    const note = {
      freightId,
      userId,
      origin: current.origin,
      destination: current.destination,
      cargo: current.cargo,
      value: current.value,
      completedAt: new Date().toISOString(),
      telemetry: noteData
    };
    await db.run(
      "INSERT OR REPLACE INTO delivery_notes (freight_id, user_id, note_json) VALUES (?, ?, ?)",
      freightId,
      userId,
      JSON.stringify(note)
    );
    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK");
    throw error;
  }

  const updated = await getFreight(freightId);
  await logActivity({ actorUserId: userId, targetUserId: userId, freightId, type: "freight.delivered", message: `Frete #${freightId} entregue. Pagamento: ${current.value}.` });
  return updated;
}

async function failFreight(userId, freightId, reason, metadata) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM freights WHERE id = ? AND user_id = ?", freightId, userId);
  if (!current || current.status !== "ativo") return null;

  await db.run(
    `UPDATE freights SET status = 'falha', failure_reason = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    reason,
    freightId
  );
  const updated = await getFreight(freightId);
  await logActivity({ actorUserId: userId, targetUserId: userId, freightId, type: "freight.failed", message: `Frete #${freightId} falhou: ${reason}.`, metadata });
  return updated;
}

async function getDeliveryNote(freightId) {
  const db = await getDb();
  const row = await db.get("SELECT * FROM delivery_notes WHERE freight_id = ?", freightId);
  if (!row) return null;
  return { id: row.id, freightId: row.freight_id, userId: row.user_id, note: JSON.parse(row.note_json), createdAt: row.created_at };
}

module.exports = {
  createFreight,
  listFreights,
  getFreight,
  acceptFreight,
  cancelFreight,
  completeFreight,
  failFreight,
  getDeliveryNote
};
