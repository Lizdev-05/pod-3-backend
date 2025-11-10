import { WebSocketServer, WebSocket } from "ws";
import { clientStore } from "../store/clientStore";
import { sendWhatsAppMessage } from "../services/whatsappService";
import { parse } from "path";

const fs = require('fs');
const FW_PATH = 'firmware.bin'; // put compiled ESP32 .bin here
const LATEST_VERSION = 'version.txt'; // set the version you want devices to update to
const webDeviceMap: Record<string, WebSocket> = { };

interface DeviceMessage {
  event: string;
  data: {
    fw_version?: string;
    to?: string;
    msg?: string;
    device_name?: string;
    type?: string;
  };
}

const parseVersion = (ver: string): number => {
        if (!ver) return 0;
        let major = 0, minor = 0, patch = 0;
        const ver_split = ver.split('.');
        major = parseInt(ver_split[0], 10) || 0;
        minor = parseInt(ver_split[1], 10) || 0;
        patch = parseInt(ver_split[2], 10) || 0;
        return major * 10000 + minor * 100 + patch;
};

export function registerDeviceSocket(wss: WebSocketServer, cwd: string = process.cwd()) {
  wss.on("connection", (ws: WebSocket) => {
    console.log("🔌 Device connected");

    ws.on("message", async (data) => {
      try {
        const parsed_msg = JSON.parse(data.toString());
        console.log('Received message:', parsed_msg);
        const { event, data: payload }: DeviceMessage = parsed_msg;

        switch (event) {
          case "update": {
            const fwVersion = parseVersion(payload?.fw_version || "");
            // console.log('hello from', fwVersion);
            const latestVer = parseVersion(fs.readFileSync(`${cwd}/${LATEST_VERSION}`, 'utf8').trim());
            // console.log('latest version is', latestVer);
            
            if (fwVersion !== latestVer) {
              const stats = fs.statSync(`${cwd}/${FW_PATH}`);
              const size = stats.size;
              // Send header with file size
              ws.send(JSON.stringify({ event: 'header', data: { size } }));
              
              // Stream file as binary frames in chunks
              const stream = fs.createReadStream(`${cwd}/${FW_PATH}`, { highWaterMark: 4096 });
              stream.on('data', (chunk: Buffer) => ws.send(chunk));
              stream.on('end', () => console.log('fw sent'));
            } else {
              ws.send(JSON.stringify({ event: 'update', data: { msg: 'Firmware is up to date' } }));
              // console.log('firmware is up to date');
            }
            break;
          }

          case "register": {
            // console.log('Register event payload:', payload);

            const deviceName = payload?.device_name?.toUpperCase();
            const type = payload?.type;

            if (type === "esp32" && deviceName) {
              clientStore.registerDevice(deviceName, ws);
              ws.send(JSON.stringify({ 
                event: "registered", 
                data: { msg: `Device ${deviceName} registered successfully` } 
              }));
            } else if (type === "web" && deviceName) {
              if (!clientStore.deviceExists(deviceName)) {
                ws.send(JSON.stringify({ 
                  event: "error", 
                  data: { msg: `Device ${deviceName} is not available` }
                }));
                // ws.close();
                break;
              }
              webDeviceMap[deviceName] = ws;
              ws.send(JSON.stringify({ 
                event: "registered", 
                data: { msg: `Web client for device ${deviceName} registered successfully` }
              }));
            }
            break;
          }

          case "send_to_whatsapp": {
            // const { to, message } = payload || {};
            const to = payload?.to;
            const message = payload?.msg;
            if (to && message) {
              await sendWhatsAppMessage(to, message);
            }
            break;
          }

          case "latest": {
            const msg = payload?.msg;
            const deviceName = payload?.device_name?.toUpperCase();
            if (deviceName && msg && webDeviceMap[deviceName]) {
              webDeviceMap[deviceName].send(JSON.stringify({ 
                event: "latest", 
                data: { msg } 
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
