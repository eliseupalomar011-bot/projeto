const http = require("http");
const config = require("./config");
const { createApp } = require("./app");
const { getDb } = require("./database/db");
const { attachWebSocket } = require("./websocket/wsHub");

async function start() {
  await getDb();
  const app = createApp();
  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.port, config.host, () => {
    console.log(`ETS2 Freight backend running at http://${config.host}:${config.port}`);
    console.log(`Admin panel: http://localhost:${config.port}/admin`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
