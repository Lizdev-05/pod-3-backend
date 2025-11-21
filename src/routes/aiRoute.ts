import { Router } from "express";
import { getDtcDetails } from "../lib/dtc_details";
import { type DTCStruct } from "../types/dtc_struct";

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

router.get("/", async (req, res) => {
    const faultCode = (req.query.code as string)?.trim();
    console.log("Received request for fault code:", faultCode);
    if (!faultCode) {
        return res.status(400).json({ error: "Missing 'code' query parameter" });
    }

    try {
        const parsed: DTCStruct = await getDtcDetails(faultCode);

        return res.json(parsed);
    } catch (error) {
        console.error("AI Error or cache error:", error);
        return res.status(500).json({ error: "AI processing failed" });
    }
});
export default router;