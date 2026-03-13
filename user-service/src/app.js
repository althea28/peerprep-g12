import express from "express";
import authRoutes from "./routes/authRoutes.js";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/", authRoutes);

// Health check (optional but useful)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "User service running"
  });
});

export default app;