import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

import apiRoutes from "./routes/api";
import aiRoute from "./routes/aiRoute";
import whatsappWebhook from "./routes/whatsappWebhook";
import { registerDeviceSocket } from "./sockets/deviceSocket";

const app = express();
app.use(express.json());
app.use("/api", apiRoutes);
app.use("/api/ai", aiRoute);
app.use("/api/webhook/whatsapp", whatsappWebhook);

// cors
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
});

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });
registerDeviceSocket(wss, process.cwd());

const PORT = process.env.PORT || 3030;
// console.log(process.env.PORT);
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
