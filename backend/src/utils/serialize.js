function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    truckLocked: Boolean(user.truck_locked),
    companyId: user.company_id,
    createdAt: user.created_at
  };
}

function freight(row) {
  if (!row) return null;
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    cargo: row.cargo,
    value: row.value,
    userId: row.user_id,
    userName: row.user_name,
    username: row.username,
    userEmail: row.user_email,
    companyId: row.company_id,
    companyName: row.company_name,
    status: row.status,
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = { publicUser, freight };
