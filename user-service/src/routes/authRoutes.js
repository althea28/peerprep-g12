import express from "express";
import {
  signup,
  login,
  verifyToken,
  logout,
  getUserInfo,
  updateUsername,
  updateUserRole
} from "../controllers/authController.js";

const router = express.Router();

// authentication routes
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.get("/auth/verify", verifyToken);
router.post("/auth/logout", logout);

// user profile routes
router.get("/auth/getUserInfo", getUserInfo);
router.put("/auth/username", updateUsername);

// admin routes
router.put("/auth/role/:userId", updateUserRole);

export default router;