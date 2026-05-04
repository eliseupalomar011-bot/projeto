const express = require("express");
const { authRequired } = require("../middlewares/auth");
const { ingestTelemetry } = require("../services/telemetryService");
const { broadcastAdmins, broadcastFreightUpdate } = require("../websocket/wsHub");

const router = express.Router();

router.post("/", authRequired, async (req, res, next) => {
  try {
    const result = await ingestTelemetry(req.user.id, req.body);
    broadcastAdmins("telemetry:update", {
      userId: req.user.id,
      activeFreightId: result.activeFreightId,
      normalized: result.normalized,
      flags: result.flags
    });
    if (result.freightUpdate) broadcastFreightUpdate(result.freightUpdate);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
