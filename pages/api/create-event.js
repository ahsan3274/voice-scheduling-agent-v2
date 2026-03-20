/**
 * POST /api/create-event
 * Body: { attendeeName, summary, startDateTime, endDateTime, timeZone }
 * Returns: { success, eventId, eventLink, summary, start }
 */

import { createCalendarEvent } from '../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { attendeeName = 'Guest', summary, startDateTime, endDateTime, timeZone = 'UTC' } = req.body;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  if (!startDateTime || !endDateTime) {
    return res.status(400).json({ error: 'startDateTime and endDateTime are required' });
  }

  try {
    const event = await createCalendarEvent({ summary, startDateTime, endDateTime, timeZone, attendeeName });
    console.log('[create-event] created', { calendarId, eventId: event.id });
    return res.status(200).json({
      success: true,
      eventId: event.id,
      eventLink: event.htmlLink,
      summary: event.summary,
      start: event.start.dateTime,
      calendarId,
    });
  } catch (err) {
    console.error('[create-event]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
