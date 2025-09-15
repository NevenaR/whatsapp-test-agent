// app.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Environment variables
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

// ----------- GET route for webhook verification -----------
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  console.log('GET / webhook verification attempt', { mode, token });

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED ✅');
    return res.status(200).send(challenge);
  } else {
    console.log('WEBHOOK VERIFICATION FAILED ❌');
    return res.status(403).end();
  }
});

// ----------- POST route for incoming messages -----------
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}`);
  console.log(JSON.stringify(req.body, null, 2));

  try {
    // Extract the message
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const messageObject = change?.value?.messages?.[0];

    if (!messageObject) {
      console.log('No message found in webhook');
      return res.sendStatus(200);
    }

    const sender = messageObject.from; // WhatsApp user phone number
    const text = messageObject.text?.body;

    if (!text) {
      console.log('Message has no text, ignoring');
      return res.sendStatus(200);
    }

    console.log(`Message from ${sender}: ${text}`);

    // ----------- Call OpenAI API -----------
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: text }],
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = openaiResponse.data.choices[0].message.content;
    console.log(`Reply from OpenAI: ${reply}`);

    // ----------- Send reply via WhatsApp Cloud API -----------
    const whatsappResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${whatsappPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: sender,
        text: { body: reply },
      },
      {
        headers: {
          'Authorization': `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Message sent via WhatsApp:', whatsappResponse.data);

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error.response?.data || error.message);
    return res.sendStatus(500);
  }
});

// ----------- Start server -----------
app.listen(port, () => {
  console.log(`Webhook server listening on port ${port}`);
});
