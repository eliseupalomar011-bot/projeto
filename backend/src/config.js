const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const databaseFile = process.env.DATABASE_FILE || "./data/ets2.sqlite";

module.exports = {
  env: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  databaseFile: path.isAbsolute(databaseFile)
    ? databaseFile
    : path.resolve(__dirname, "..", databaseFile),
  adminUsername: process.env.ADMIN_USERNAME || "palomareliseuaz163",
  adminEmail: process.env.ADMIN_EMAIL || "palomareliseuaz163@gmail.com",
  adminPassword: process.env.ADMIN_PASSWORD || "mm06042012",
  adminName: process.env.ADMIN_NAME || "Administrador",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  maxSpeedKmh: Number(process.env.MAX_SPEED_KMH || 160),
  failSpeedKmh: Number(process.env.FAIL_SPEED_KMH || 200),
  deliveryDistanceMeters: Number(process.env.DELIVERY_DISTANCE_METERS || 50),
  telemetryStaleSeconds: Number(process.env.TELEMETRY_STALE_SECONDS || 15)
};
