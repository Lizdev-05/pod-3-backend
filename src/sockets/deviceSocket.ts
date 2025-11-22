import { WebSocketServer, WebSocket } from "ws";
import { clientStore } from "../store/clientStore";
import { sendWhatsAppMessage } from "../services/whatsappService";
import { whatsappToDeviceMap } from "../routes/whatsappWebhook";
import { send } from "process";

const fs = require('fs');
const FW_PATH = 'firmware.bin'; // put compiled ESP32 .bin here
const LATEST_VERSION = 'version.txt'; // set the version you want devices to update to
const webDeviceMap: Record<string, WebSocket[]> = { };

interface DeviceMessage {
  event: string;
  data: {
    fw_version?: string;
    to?: string;
    msg?: string;
    device_name?: string;
    device_pos?: number;
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

            // event: string;
            // data: {
            //   fw_version?: string;
            // };

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

            //   event: string;
            //   data: {
            //     device_name?: string;
            //     type?: string;
            //   };

            const deviceName = payload?.device_name?.toUpperCase();
            const type = payload?.type;

            if (type === "esp32" && deviceName && !clientStore.deviceExists(deviceName)) {
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

              if (!webDeviceMap[deviceName]) {
                webDeviceMap[deviceName] = [];
              }

              if(webDeviceMap[deviceName].includes(ws)){
                ws.send(JSON.stringify({ 
                  event: "error", 
                  data: { msg: `Web client for device ${deviceName} is already registered` }
                }));
                break;
              }

              webDeviceMap[deviceName].push(ws);

              ws.send(JSON.stringify({ 
                event: "registered", 
                data: { msg: `Web client for device ${deviceName} registered successfully` }
              }));

            } else {
              ws.send(JSON.stringify({ 
                event: "error", 
                data: { msg: `Device ${deviceName} is already registered or invalid type` }
              }));
              // ws.close();
            }
            break;
          }

          case "send_to_whatsapp": {
            // const { to, message } = payload || {};
            const to = payload?.to;
            const message = payload?.msg;
            if (to && message) {
              await sendWhatsAppMessage(to, message as string);
            }
            break;
          }

          case "latest": {
            // interface paylod {
            //   event: string;
            //   data: {
            //     device_name?: string;
            //     msg?: string;
            //   };
            // }
            const msg = payload?.msg;
            const deviceName = payload?.device_name?.toUpperCase();
            if (deviceName && msg && webDeviceMap[deviceName]) {
              webDeviceMap[deviceName].forEach(ws => ws.send(JSON.stringify({ 
                event: "latest", 
                data: { msg } 
              })));
            }
            break;
          }

          case "dtcs_cleared": {
            const msg = payload?.msg;
            const deviceName = payload?.device_name?.toUpperCase();
            const device_pos = payload?.device_pos || 0;

            if (deviceName && msg && webDeviceMap[deviceName]) {
              webDeviceMap[deviceName][device_pos].send(JSON.stringify({ 
                event: "dtcs_cleared", 
                data: { msg } 
              }));
            }
            break;
          }

          case "clear_dtcs": {
            const deviceName = payload?.device_name?.toUpperCase();
            if(deviceName && clientStore.deviceExists(deviceName)){
              // get array position of web client in webDeviceMap
              const index = webDeviceMap[deviceName].indexOf(ws);
              clientStore.sendToDevice(deviceName, {event, data:{device_pos: index}});
            } else {
              ws.send(JSON.stringify({ 
                  event: "error", 
                  data: { msg: `Device ${deviceName} is not available` }
                }));
            }
          }

          default:
            break;
        }
      } catch (err) {
        console.error("⚠️ Invalid message:", err)
      }
    });

    ws.on("close", () => {
      for (const [id, socket] of clientStore.devices.entries()) {
        if (socket === ws) {
          clientStore.removeDevice(id);

          // broadcast device disconnection to other clients
          webDeviceMap[id].forEach(ws => ws.send(JSON.stringify({
            event: "device_disconnected",
            data: { device_name: id }
          })))
          delete webDeviceMap[id];
          
          Object.keys(whatsappToDeviceMap).forEach(key => {
            if (whatsappToDeviceMap[key] === id) {
              sendWhatsAppMessage(key, `Device ${id} disconnected`);
              delete whatsappToDeviceMap[key];
            }
          });

          console.log(`🔌 Device ${id} disconnected`);
          break;
        }
      }

      for (const [name, socket] of Object.entries(webDeviceMap)) {
        if (socket.includes(ws)) {
          webDeviceMap[name] = socket.filter(s => s !== ws);
          console.log(`🔌 Web client ${name} disconnected`);
          break;
        }
      }
    });
  });
}
