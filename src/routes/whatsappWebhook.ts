import { Router } from "express";
import { clientStore } from "../store/clientStore";
import { sendWhatsAppMessage } from "../services/whatsappService";
import { getDtcDetails } from "../lib/dtc_details";

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

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "myverifytoken";
const whatsappToDeviceMap: Record<string, string> = { };

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.status(403).send("Forbidden");
});


router.post("/", async (req, res) => {
  const body = req.body;
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);
  const from = message.from;
  const text = message.text?.body.toUpperCase();

  if (!text) return res.sendStatus(200);

  let command = text;
  if (text.startsWith("REGISTER") || text.startsWith("UNREGISTER") || text.startsWith("STATUS") || text.startsWith("HELP") || text.startsWith("INFO") || text.startsWith("CLEAR")) {
    command = text.split(" ")[0];
  } else {
    sendWhatsAppMessage(from, `Invalid command. Type HELP for a list of commands.`);
  }

  switch (command) {
    case "REGISTER": {
      const deviceName = text.split(" ")[1] ?? null;
      const deviceExists = clientStore.deviceExists(deviceName);

      if (!deviceName){
        sendWhatsAppMessage(from, `Please provide a device name.`);
        break;
      }

      if (deviceName && deviceExists) {
        whatsappToDeviceMap[from] = deviceName;
        sendWhatsAppMessage(from, `Device ${deviceName} registered successfully.`);
        sendWhatsAppMessage(from, `You can now send commands to your device. Type HELP for a list of commands.`);
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

    case "HELP": {
      const helpMessage = `Available commands:
      - REGISTER <DEVICE_NAME>: Register your device.
      - UNREGISTER: Unregister your device.
      - STATUS: Check the status of your device.
      - INFO: Get information from your device.
      - INFO <TROUBLE CODE>: Get details about a specific trouble code.
      - CLEAR: Clear diagnostics trouble code.
      - HELP: Show this help message.`;

      sendWhatsAppMessage(from, helpMessage);
      break;
    }

    case "INFO": {
      const deviceName = whatsappToDeviceMap[from];
      const troubleCode = text.split(" ")[1] ?? null;

      if (troubleCode) {
        try {
          const dtcDetails = await getDtcDetails(troubleCode);

          // Send detailed info message
          const infoMessage = `*Details for code ${troubleCode}*:
          *Name*: ${dtcDetails.name}
          *Description*: ${dtcDetails.description}
          *Affected Models*: ${dtcDetails.affected_models.brand} ${dtcDetails.affected_models.models} (${dtcDetails.affected_models.years})
          *Likely Causes*: ${dtcDetails.likely_causes.join(", ")}
          *Guided Steps*:
          ${dtcDetails.guided_steps.map((step: any) => `  Step ${step.step}: ${step.title} - ${step.description} (Tools Needed: ${step.tools_needed.join(", ")})`).join("\n")}
          *Tutorials*:
          ${dtcDetails.tutorials.title} - https://www.youtube.com/watch?v=${dtcDetails.tutorials.youtubeId}
          ${dtcDetails.bite_sized_insights ? `*Bite-Sized Insights*: ${dtcDetails.bite_sized_insights.join(", ")}` : ""}
          ${dtcDetails.sources ? `*Sources*: ${dtcDetails.sources.join(", ")}` : ""}`;

          sendWhatsAppMessage(from, infoMessage);
        } catch (error) {
          console.error("Error fetching DTC details:", error);
          sendWhatsAppMessage(from, `Failed to retrieve details for code ${troubleCode}.`);
        }
        break;
      }

      // If no trouble code, just request general info
      if (deviceName && clientStore.deviceExists(deviceName)) {
        clientStore.sendToDevice(deviceName, { event: "info_request", data: { from } });
      } else {
        sendWhatsAppMessage(from, `No device registered or device is offline.`);
      }
      break;
    }

    case "CLEAR": {
      const deviceName = whatsappToDeviceMap[from];
      if (deviceName && clientStore.deviceExists(deviceName)) {
        clientStore.sendToDevice(deviceName, { data: { from }, event: "clear_dtcs" });
      } else {
        sendWhatsAppMessage(from, `No device registered or device is offline.`);
      }
      break;
    }

    default: {
      break;
    }
  }
  res.sendStatus(200);
});
export default router;
