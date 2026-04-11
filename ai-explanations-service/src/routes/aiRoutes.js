import express from "express";
import { handleExplain } from "../controllers/aiController.js";

const router = express.Router();

router.post("/explain", handleExplain);

export default router;