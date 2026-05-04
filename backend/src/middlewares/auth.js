const jwt = require("jsonwebtoken");
const config = require("../config");
const { HttpError } = require("../utils/httpError");

function authRequired(req, _res, next) {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  if (!token) return next(new HttpError(401, "Token ausente."));

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = { id: Number(decoded.sub), role: decoded.role };
    next();
  } catch (error) {
    next(new HttpError(401, "Token invalido ou expirado."));
  }
}

function adminRequired(req, _res, next) {
  if (req.user?.role !== "admin") return next(new HttpError(403, "Acesso restrito ao admin."));
  next();
}

module.exports = { authRequired, adminRequired };
