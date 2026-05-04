const express = require("express");
const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "ets2-freight-backend", at: new Date().toISOString() });
});

module.exports = router;
