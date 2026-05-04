const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const config = require("./config");
const authRoutes = require("./routes/authRoutes");
const freightRoutes = require("./routes/freightRoutes");
const adminRoutes = require("./routes/adminRoutes");
const telemetryRoutes = require("./routes/telemetryRoutes");
const healthRoutes = require("./routes/healthRoutes");
const { errorHandler } = require("./middlewares/errorHandler");

function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(config.env === "production" ? "combined" : "dev"));

  app.use("/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/freights", freightRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/telemetry", telemetryRoutes);

  app.use("/admin", express.static(path.resolve(__dirname, "../../admin")));
  app.get("/", (_req, res) => res.redirect("/admin"));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
