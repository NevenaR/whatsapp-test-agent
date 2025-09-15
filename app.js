// app.js
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
require('dotenv').config();
const fs = require('fs');

const app = express();
app.use(express.json());

// ----------- Environment variables -----------
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const calendarId = process.env.GOOGLE_CALENDAR_ID;

// ----------- Google Calendar setup -----------
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Parse credentials from environment variable
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: SCOPES,
});

const calendar = google.calendar({ version: 'v3', auth });

async function listBusySlots(timeMin, timeMax) {
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return res.data.items.map(event => ({
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
  }));
}

async function createAppointment(summary, start, end) {
  const event = {
    summary,
    start: { dateTime: start },
    end: { dateTime: end },
  };

  const res = await calendar.events.insert({
    calendarId,
    resource: event,
  });

  return res.data;
}

// ----------- Webhook verification -----------
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED ✅');
    return res.status(200).send(challenge);
  } else {
    console.log('WEBHOOK VERIFICATION FAILED ❌');
    return res.sendStatus(403);
  }
});

// ----------- Incoming WhatsApp messages -----------
app.post('/', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const messageObject = change?.value?.messages?.[0];

    if (!messageObject) return res.sendStatus(200);

    const sender = messageObject.from;
    const text = messageObject.text?.body;

    if (!text) return res.sendStatus(200);

    console.log(`Message from ${sender}: ${text}`);

    // ----------- Get busy slots for next 7 days -----------
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const busySlots = await listBusySlots(now.toISOString(), oneWeekLater.toISOString());

    // ----------- AI prompt with available slots -----------
    const aiPrompt = `
You are a friendly beauty salon booking assistant.
The user wants to book an appointment.
Currently booked slots are:
${busySlots.map(b => `${b.start} to ${b.end}`).join('\n') || 'No bookings yet.'}

Please suggest **one available slot** for the user in the next 7 days.
If the user confirms, respond in JSON format:
{
  "action": "book",
  "start": "YYYY-MM-DDTHH:mm:ss",
  "end": "YYYY-MM-DDTHH:mm:ss"
}
Otherwise, reply naturally to guide the user.
User message: ${text}
`;

    // ----------- Call OpenAI -----------
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: aiPrompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = openaiResponse.data.choices[0].message.content;
    console.log(`AI reply: ${reply}`);

    let whatsappReply = reply;

    // ----------- Check if AI suggested booking -----------
    try {
      const jsonAction = JSON.parse(reply);
      if (jsonAction.action === 'book') {
        const bookedEvent = await createAppointment('Beauty Salon Appointment', jsonAction.start, jsonAction.end);
        whatsappReply = `✅ Your appointment has been booked for ${new Date(jsonAction.start).toLocaleString()}`;
      }
    } catch (err) {
      // Not JSON, normal conversation
    }

    // ----------- Send reply via WhatsApp -----------
    await axios.post(
      `https://graph.facebook.com/v17.0/${whatsappPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: sender,
        text: { body: whatsappReply },
      },
      {
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

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
