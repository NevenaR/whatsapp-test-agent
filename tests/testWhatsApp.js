// test/testWhatsApp.js
require('dotenv').config();
const { sendWhatsAppMessage } = require('../services/whatsapp');

(async () => {
  try {
    const testNumber = process.env.TEST_WHATSAPP_NUMBER; // e.g., "16315551181"
    if (!testNumber) {
      throw new Error("⚠️ Please set TEST_WHATSAPP_NUMBER in your .env file");
    }

    console.log("Sending test WhatsApp message to:", testNumber);

    await sendWhatsAppMessage(testNumber, "Hello 👋 This is a test message from my bot!");
    console.log("✅ WhatsApp test message sent successfully!");
  } catch (err) {
    console.error("❌ WhatsApp test failed:", err.response?.data || err.message);
  }
})();
