import { google } from 'googleapis';

function getCalendarClient() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(keyRaw),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

export async function createCalendarEvent({ 
  summary, 
  startDateTime, 
  endDateTime, 
  timeZone = 'UTC', 
  attendeeName,
  attendeeEmail 
}) {
  const calendar = getCalendarClient();
  // Use service account's primary calendar
  // IMPORTANT: Share your calendar with voice-scheduling-agent@voice-scheduling-agent-490801.iam.gserviceaccount.com
  // Go to calendar.google.com → Settings → Share with specific people → Add service account email with "Make changes to events"
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const { data } = await calendar.events.insert({
    calendarId,
    resource: {
      summary: summary || `Meeting with ${attendeeName}`,
      description: `Scheduled via Voice Scheduling Agent\nBooked by: ${attendeeName}`,
      start: { dateTime: startDateTime, timeZone },
      end: { dateTime: endDateTime, timeZone },
      attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    },
    sendUpdates: attendeeEmail ? 'all' : 'none',
  });

  return data;
}
