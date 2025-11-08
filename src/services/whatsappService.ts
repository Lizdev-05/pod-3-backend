import axios from "axios";
const WHATSAPP_API_URL = "https://graph.facebook.com/v19.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    const res = await axios.post(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }, { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });
    console.log("📤 Sent WhatsApp message:", res.data);
  } catch (error: any) {
    console.error("❌ Error sending WhatsApp message:", error.response?.data || error.message);
  }
}
