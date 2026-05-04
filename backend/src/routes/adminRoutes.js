const express = require("express");
const { authRequired, adminRequired } = require("../middlewares/auth");
const { createFreight, listFreights, cancelFreight } = require("../services/freightService");
const { listUsers, createUserByAdmin, updateUserByAdmin, deleteUserByAdmin, setTruckLock } = require("../services/userService");
const { listLogs } = require("../services/logService");
const { notifyNewFreight, broadcastFreightUpdate, broadcastToUser, broadcastAdmins } = require("../websocket/wsHub");

const router = express.Router();
router.use(authRequired, adminRequired);

router.get("/users", async (_req, res, next) => {
  try {
    res.json({ users: await listUsers() });
  } catch (error) {
    next(error);
  }
});

router.post("/users", async (req, res, next) => {
  try {
    const user = await createUserByAdmin(req.user.id, req.body);
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:id", async (req, res, next) => {
  try {
    const user = await updateUserByAdmin(req.user.id, Number(req.params.id), req.body);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    res.json(await deleteUserByAdmin(req.user.id, Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post("/users/:id/truck-lock", async (req, res, next) => {
  try {
    const user = await setTruckLock(req.user.id, Number(req.params.id), Boolean(req.body.locked));
    broadcastToUser(user.id, "truck:lock", { locked: user.truckLocked });
    broadcastAdmins("truck:lock", { userId: user.id, locked: user.truckLocked });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get("/freights", async (_req, res, next) => {
  try {
    res.json({ freights: await listFreights({ role: "admin" }) });
  } catch (error) {
    next(error);
  }
});

router.post("/freights", async (req, res, next) => {
  try {
    const freight = await createFreight(req.user.id, req.body);
    notifyNewFreight(freight);
    res.status(201).json({ freight });
  } catch (error) {
    next(error);
  }
});

router.post("/freights/:id/cancel", async (req, res, next) => {
  try {
    const freight = await cancelFreight(req.user.id, Number(req.params.id));
    broadcastFreightUpdate(freight);
    res.json({ freight });
  } catch (error) {
    next(error);
  }
});

router.get("/logs", async (req, res, next) => {
  try {
    res.json({ logs: await listLogs(Number(req.query.limit || 100)) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
