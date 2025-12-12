// calendar.js
const { google } = require('googleapis');
const { DateTime } = require('luxon');

// Load service account credentials
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: SCOPES,
});
const calendar = google.calendar({ version: 'v3', auth });

// List busy slots in a given period
async function listBusySlots(calendarId, timeMin, timeMax) {
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });
  return res.data.calendars[calendarId].busy;
}

// Create an appointment event
async function createAppointment(calendarId, summary, startTime, endTime) {
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    },
  });
  return res.data;
}

// Generate available time slots based on busy periods
function generateAvailableSlots(busySlotsZurich, startDate, endDate, options = {}) {
  const {
    workingHours = { start: 9, end: 18 }, // 9 AM to 6 PM
    slotInterval = 30, // 30-minute slots
    timezone = "Europe/Zurich"
  } = options;

  const slots = [];
  
  let currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0); // Reset to start of day
  const end = new Date(endDate);
  
  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    // Generate slots for this day
    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += slotInterval) {
        const slotStart = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        const slotStartDT = DateTime.fromISO(slotStart, { zone: timezone });
        const slotEndDT = slotStartDT.plus({ minutes: slotInterval });
        const slotEnd = slotEndDT.toISO();
        
        // Check if this slot overlaps with any busy period
        const isAvailable = !busySlotsZurich.some(busy => {
          const busyStart = DateTime.fromISO(busy.start);
          const busyEnd = DateTime.fromISO(busy.end);
          const slotStartCheck = DateTime.fromISO(slotStart, { zone: timezone });
          const slotEndCheck = DateTime.fromISO(slotEnd);
          
          // Check for overlap: slot starts before busy ends AND slot ends after busy starts
          return slotStartCheck < busyEnd && slotEndCheck > busyStart;
        });
        
        if (isAvailable) {
          // Format in human-readable way
          const timeStr = slotStartDT.toFormat('HH:mm');
          slots.push({
            date: dateStr,
            time: timeStr,
            datetime: slotStart
          });
        }
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return slots;
}

// Format available slots for AI consumption
function formatAvailableSlotsForAI(slots) {
  if (slots.length === 0) {
    return "No available slots in the requested period.";
  }
  
  // Group by date
  const byDate = {};
  slots.forEach(slot => {
    if (!byDate[slot.date]) byDate[slot.date] = [];
    byDate[slot.date].push(slot.time);
  });
  
  let formatted = "**AVAILABLE TIME SLOTS:**\n";
  Object.keys(byDate).sort().forEach(date => {
    const times = byDate[date];
    formatted += `\n${date}: ${times.join(', ')}\n`;
  });
  
  formatted += "\n**IMPORTANT:** Only suggest times from this list. When booking, use format: YYYY-MM-DDTHH:MM:SS";
  
  return formatted;
}

// Get available slots with busy periods already factored in
async function getAvailableSlots(calendarId, startDate, endDate, options = {}) {
  // Get busy slots from calendar (in UTC)
  const busySlotsUTC = await listBusySlots(calendarId, startDate.toISOString(), endDate.toISOString());
  
  // Convert to Zurich timezone
  const busySlotsZurich = busySlotsUTC.map(slot => ({
    start: DateTime.fromISO(slot.start).setZone("Europe/Zurich").toISO(),
    end: DateTime.fromISO(slot.end).setZone("Europe/Zurich").toISO(),
  }));
  
  console.log("Busy slots (Zurich):", busySlotsZurich);
  
  // Generate available slots
  const availableSlots = generateAvailableSlots(busySlotsZurich, startDate, endDate, options);
  console.log(`Generated ${availableSlots.length} available slots`);
  
  return availableSlots;
}

module.exports = { 
  listBusySlots, 
  createAppointment,
  generateAvailableSlots,
  formatAvailableSlotsForAI,
  getAvailableSlots
};