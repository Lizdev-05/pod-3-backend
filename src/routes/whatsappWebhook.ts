import { Router } from "express";
import { clientStore } from "../store/clientStore";
import { sendWhatsAppMessage } from "../services/whatsappService";

const router = Router();
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "myverifytoken";
const whatsappToDeviceMap: Record<string, string> = { };

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.status(403).send("Forbidden");
});


router.post("/", (req, res) => {
  const body = req.body;
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);
  const from = message.from;
  const text = message.text?.body.toUpperCase();

  if (!text) return res.sendStatus(200);

  let command = text;
  if (text.startsWith("REGISTER") || text.startsWith("UNREGISTER")) {
    command = text.split(" ")[0];
  }

  switch (command) {
    case "REGISTER": {
      const deviceName = text.split(" ")[1];
      const deviceExists = clientStore.deviceExists(deviceName);

      if (deviceName && deviceExists) {
        whatsappToDeviceMap[from] = deviceName;
        sendWhatsAppMessage(from, `Device ${deviceName} registered successfully.`);
      } else {
        sendWhatsAppMessage(from, `Device ${deviceName} is not available.`);
      }
      break;
    }
    
    case "UNREGISTER": {
      delete whatsappToDeviceMap[from];
      sendWhatsAppMessage(from, `Your device has been unregistered successfully.`);
      break;
    }

    case "STATUS": {
      const deviceName = whatsappToDeviceMap[from];
      if (deviceName && clientStore.deviceExists(deviceName)) {
        sendWhatsAppMessage(from, `Your device ${deviceName} is online.`);
      } else {
        sendWhatsAppMessage(from, `No device registered or device is offline.`);
      }
      break;
    }

    default: {
      const deviceName = whatsappToDeviceMap[from];
      if (deviceName && clientStore.deviceExists(deviceName)) {
        clientStore.sendToDevice(deviceName, { from, text });
      } else {
        sendWhatsAppMessage(from, `No device registered or device is offline.`);
      }
    }
  }
  res.sendStatus(200);
});
export default router;
