import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import apiRoutes from "./routes/api";
import whatsappWebhook from "./routes/whatsappWebhook";
import { registerDeviceSocket } from "./sockets/deviceSocket";

dotenv.config();

const app = express();
app.use(express.json());
app.use("/api", apiRoutes);
app.use("/api/webhook/whatsapp", whatsappWebhook);

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });
registerDeviceSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
