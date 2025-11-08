import { WebSocketServer, WebSocket } from "ws";
import { clientStore } from "../store/clientStore";
import { sendWhatsAppMessage } from "../services/whatsappService";

const fs = require('fs');
const FW_PATH = 'firmware.bin'; // put compiled ESP32 .bin here
const LATEST_VERSION = 'version.txt'; // set the version you want devices to update to
const webDeviceMap: Record<string, WebSocket> = { };

interface DeviceMessage {
  event: string;
  data: {
    fw_version?: string;
    to?: string;
    message?: string;
    device_name?: string;
    type?: string;
  };
}
export function registerDeviceSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket) => {
    console.log("🔌 Device connected");

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const { event, data: payload }: DeviceMessage = msg;

        switch (event) {
          case "update": {
            const fwVersion = payload?.fw_version;
            console.log('hello from', fwVersion);
            const latestVer = fs.readFileSync(LATEST_VERSION, 'utf8').trim();
            console.log('latest version is', latestVer);
            
            if (fwVersion !== latestVer) {
              const stats = fs.statSync(FW_PATH);
              const size = stats.size;
              // Send header with file size
              ws.send(JSON.stringify({ event: 'header', data: { size } }));
              
              // Stream file as binary frames in chunks
              const stream = fs.createReadStream(FW_PATH, { highWaterMark: 4096 });
              stream.on('data', (chunk: Buffer) => ws.send(chunk));
              stream.on('end', () => console.log('fw sent'));
            }
            break;
          }

          case "register": {
            const { type, device_name } = payload || {};
            if (!type || !device_name) break;

            if (type === "esp32") {
              clientStore.registerDevice(device_name, ws);
              ws.send(JSON.stringify({ 
                event: "registered", 
                data: `Device ${device_name} registered successfully` 
              }));
            } else if (type === "web") {
              webDeviceMap[device_name] = ws;
              ws.send(JSON.stringify({ 
                event: "registered", 
                data: `Web client ${device_name} registered successfully` 
              }));
            }
            break;
          }

          case "send_to_whatsapp": {
            const { to, message } = payload || {};
            if (to && message) {
              await sendWhatsAppMessage(to, message);
            }
            break;
          }

          case "latest": {
            const { device_name, message } = payload || {};
            if (device_name && message && webDeviceMap[device_name]) {
              webDeviceMap[device_name].send(JSON.stringify({ 
                event: "latest", 
                data: { message } 
              }));
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error("⚠️ Invalid message:", err);
      }
    });

    ws.on("close", () => {
      for (const [id, socket] of clientStore.devices.entries()) {
        if (socket === ws) {
          clientStore.removeDevice(id);
          console.log(`🔌 Device ${id} disconnected`);
          break;
        }
      }

      for (const [name, socket] of Object.entries(webDeviceMap)) {
        if (socket === ws) {
          delete webDeviceMap[name];
          console.log(`🔌 Web client ${name} disconnected`);
          break;
        }
      }
    });
  });
}
