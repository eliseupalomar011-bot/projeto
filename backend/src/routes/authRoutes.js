const express = require("express");
const { register, login } = require("../services/authService");
const { authRequired } = require("../middlewares/auth");
const { me } = require("../services/userService");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    res.status(201).json(await register(req.body));
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    res.json(await login(req.body));
  } catch (error) {
    next(error);
  }
});

router.get("/me", authRequired, async (req, res, next) => {
  try {
    res.json({ user: await me(req.user.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
