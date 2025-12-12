// testCalendar.js
require('dotenv').config();
const { listBusySlots, createAppointment } = require('../services/calendar');

(async () => {
  try {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7*24*60*60*1000);

    console.log("Testing calendar:", calendarId);

    // 1. Check busy slots
    const busy = await listBusySlots('nevena.radovano@gmail.com', '2025-09-18T17:00:00.000Z', '2025-09-18T18:00:00.000Z');
    //const busy = await listBusySlots(calendarId, now.toISOString(), oneWeekLater.toISOString());
    console.log("Busy slots:", busy);

    // 2. Create a test event 1 hour from now
    const start = new Date(now.getTime() + 60*60*1000).toISOString();
    const end = new Date(now.getTime() + 2*60*60*1000).toISOString();
    const event = await createAppointment(calendarId, "Test Appointment", start, end);
    console.log("Created event:", event.htmlLink);
  } catch (err) {
    console.error("Calendar test failed:", err.response?.data || err.message);
  }
})();
