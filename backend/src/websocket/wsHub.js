const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const config = require("../config");

const clientsByUser = new Map();
const adminClients = new Set();

function addToMap(map, key, ws) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(ws);
}

function send(ws, event, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data }));
}

function broadcastToUser(userId, event, data) {
  const clients = clientsByUser.get(Number(userId));
  if (!clients) return;
  for (const ws of clients) send(ws, event, data);
}

function broadcastAdmins(event, data) {
  for (const ws of adminClients) send(ws, event, data);
}

function broadcastFreightUpdate(freight) {
  broadcastToUser(freight.userId, "freight:update", freight);
  broadcastAdmins("freight:update", freight);
}

function notifyNewFreight(freight) {
  broadcastToUser(freight.userId, "freight:new", freight);
  broadcastAdmins("freight:new", freight);
}

function attachWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      ws.user = { id: Number(decoded.sub), role: decoded.role };
      addToMap(clientsByUser, ws.user.id, ws);
      if (ws.user.role === "admin") adminClients.add(ws);
      send(ws, "connected", { userId: ws.user.id, role: ws.user.role });
    } catch (error) {
      ws.close(1008, "Token invalido");
      return;
    }

    ws.on("message", (message) => {
      if (message.toString() === "ping") send(ws, "pong", { at: Date.now() });
    });

    ws.on("close", () => {
      const userSet = clientsByUser.get(ws.user?.id);
      if (userSet) {
        userSet.delete(ws);
        if (userSet.size === 0) clientsByUser.delete(ws.user.id);
      }
      adminClients.delete(ws);
    });
  });

  return wss;
}

module.exports = {
  attachWebSocket,
  broadcastToUser,
  broadcastAdmins,
  broadcastFreightUpdate,
  notifyNewFreight
};
