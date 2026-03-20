/**
 * POST /api/create-event
 * Body: { attendeeName, summary, startDateTime, endDateTime, timeZone }
 * Returns: { success, eventId, eventLink, summary, start }
 */

import { createCalendarEvent } from '../../lib/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { attendeeName = 'Guest', summary, startDateTime, endDateTime, timeZone = 'UTC' } = req.body;

  if (!startDateTime || !endDateTime) {
    return res.status(400).json({ error: 'startDateTime and endDateTime are required' });
  }

  try {
    const event = await createCalendarEvent({ summary, startDateTime, endDateTime, timeZone, attendeeName });
    return res.status(200).json({
      success: true,
      eventId: event.id,
      eventLink: event.htmlLink,
      summary: event.summary,
      start: event.start.dateTime,
    });
  } catch (err) {
    console.error('[create-event]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
