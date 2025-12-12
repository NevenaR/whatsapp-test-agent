// app.js
const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { createAppointment, getAvailableSlots } = require('./services/calendar');
const { sendWhatsAppMessage } = require('./services/whatsapp');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const calendarId = process.env.GOOGLE_CALENDAR_ID;

// ----------------- LOAD SERVICES CONFIGURATION -----------------
let servicesData;
try {
  const servicesPath = path.join(__dirname, 'services.json');
  servicesData = JSON.parse(fs.readFileSync(servicesPath, 'utf8'));
  console.log(`✅ Loaded ${servicesData.categories.reduce((sum, cat) => sum + cat.services.length, 0)} services from configuration`);
} catch (err) {
  console.error('❌ Failed to load services.json:', err.message);
  process.exit(1);
}

// ----------------- SESSION MANAGEMENT -----------------
const sessions = {};
const processedMessages = new Set();

function initSession(sender) {
  if (!sessions[sender]) {
    sessions[sender] = { messages: [], step: 0 }; // step tracks the scripted flow
  }
}

// ----------------- WEBHOOK VERIFICATION -----------------
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED ✅');
    return res.status(200).send(challenge);
  }
  console.log('WEBHOOK VERIFICATION FAILED ❌');
  return res.sendStatus(403);
});

// ----------------- INCOMING MESSAGES -----------------
app.post('/', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const messageObject = change?.value?.messages?.[0];

    if (!messageObject) return res.sendStatus(200);

    const MAX_AGE_SECONDS = 10;
    const msgTimestamp = parseInt(messageObject.timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sender = messageObject.from;

    if (nowSeconds - msgTimestamp > MAX_AGE_SECONDS) {
      console.log(`Ignoring old message from ${sender}`);
      return res.sendStatus(200);
    }

    const text = messageObject.text?.body;
    if (!text) return res.sendStatus(200);

    const uniqueKey = `${sender}|${text}`;
    if (processedMessages.has(uniqueKey)) {
      console.log(`Duplicate message ignored: ${uniqueKey}`);
      return res.sendStatus(200);
    }
    processedMessages.add(uniqueKey);

    // Immediately acknowledge webhook
    res.sendStatus(200);

    console.log(`Message from ${sender}: ${text}`);

    initSession(sender);
    const session = sessions[sender];
    session.messages.push({ role: "user", content: text });
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    // ---------------- SCRIPTED FIXED REPLIES ----------------
    let reply = "";

    if (session.step === 0) {
      reply = "Hallo liebe Kundin 😊 klar! Ich schaue kurz im Kalender nach…\nJa, um 15:00 Uhr wäre noch frei. Möchten Sie den Termin buchen?";
      session.step = 1;
    } else if (session.step === 1) {
      // Optionally create the appointment in Google Calendar here
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const start = new Date(tomorrow);
      start.setHours(15, 0, 0); // 15:00 Uhr
      const end = new Date(start);
      end.setMinutes(start.getMinutes() + 30); // default duration 30 min

      await createAppointment(calendarId, "Haarschnitt", start.toISOString(), end.toISOString());

      reply = "Super 💇 Ihr Termin ist morgen um 15:00 Uhr bestätigt.\nSie erhalten eine Erinnerung eine Stunde vor dem Termin 📅";
      session.step = 2;
    } else if (session.step === 2) {
      reply = "Sehr gerne 💕";
      session.step = 3;
    } else {
      reply = "Wir haben das Gespräch abgeschlossen. Bis bald 😊";
    }

    // Send reply
    await sendWhatsAppMessage(sender, reply);

    // Clear messages if conversation finished
    if (session.step >= 3) {
      sessions[sender] = { messages: [], step: 0 };
    }

  } catch (err) {
    console.error("Error handling webhook:", err.message);
  }
});

// ----------------- START SERVER -----------------
app.listen(port, () => {
  console.log(`Webhook server listening on port ${port}`);
});
