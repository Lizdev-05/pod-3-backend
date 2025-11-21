import { Router } from "express";
const router = Router();

// Add CORS headers for this route group
router.use((req, res, next) => {
  // change origin to your frontend URL in production (e.g. http://localhost:5173)
  const origin = process.env.FRONTEND_ORIGIN ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  // respond to preflight
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

router.get("/", (req, res) => res.json({ message: "API works" }));
export default router;
