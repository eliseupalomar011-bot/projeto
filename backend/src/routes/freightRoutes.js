const express = require("express");
const { authRequired } = require("../middlewares/auth");
const { listFreights, acceptFreight, getDeliveryNote } = require("../services/freightService");
const { broadcastFreightUpdate } = require("../websocket/wsHub");

const router = express.Router();

router.get("/", authRequired, async (req, res, next) => {
  try {
    res.json({ freights: await listFreights({ userId: req.user.id, role: req.user.role }) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/accept", authRequired, async (req, res, next) => {
  try {
    const freight = await acceptFreight(req.user.id, Number(req.params.id));
    broadcastFreightUpdate(freight);
    res.json({ freight });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/delivery-note", authRequired, async (req, res, next) => {
  try {
    const note = await getDeliveryNote(Number(req.params.id));
    if (!note) return res.status(404).json({ error: { message: "Nota nao encontrada.", status: 404 } });
    if (req.user.role !== "admin" && note.userId !== req.user.id) return res.status(403).json({ error: { message: "Acesso negado.", status: 403 } });
    res.json({ deliveryNote: note });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
