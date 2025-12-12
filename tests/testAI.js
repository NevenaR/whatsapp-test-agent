// test/testAI.js
require('dotenv').config();
const { getAIReply } = require('../services/openai');

(async () => {
  try {
    const prompt = "Suggest me a free slot for a haircut between tomorrow and next week.";
    console.log("Prompt:", prompt);

    const reply = await getAIReply(prompt);
    console.log("AI reply:", reply);
  } catch (err) {
    console.error("❌ AI test failed:", err.response?.data || err.message);
  }
})();
