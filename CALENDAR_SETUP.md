# Google Calendar Setup Guide

## Problem
Events are being created but you can't see them because the calendar isn't shared with the service account.

## Solution (5 minutes)

### Step 1: Create a Demo Calendar

1. Go to [calendar.google.com](https://calendar.google.com)
2. On the left sidebar, click the **+** next to "Other calendars"
3. Select **Create new calendar**
4. Name it: `Voice Agent Demo`
5. Click **Create calendar**

### Step 2: Share with Service Account

1. After creation, you'll see the calendar settings page
2. Scroll down to **Share with specific people**
3. Click **Add people**
4. Enter this email:
   ```
   voice-scheduling-agent@voice-scheduling-agent-490801.iam.gserviceaccount.com
   ```
5. Under **Permissions**, select: **Make changes to events**
6. Click **Send**

### Step 3: Get Calendar ID

1. Still in the calendar settings page
2. Scroll to the top section **Settings for my calendar**
3. Find **Calendar ID** - it looks like:
   ```
   xxxxxxxxxxxxxxxxxxxxxxxxxxxx@group.calendar.google.com
   ```
4. Copy this ID

### Step 4: Update Vercel Environment

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project: `voice-scheduling-agent-v2`
3. Go to **Settings** → **Environment Variables**
4. Find `GOOGLE_CALENDAR_ID`
5. Click **Edit**
6. Paste your calendar ID
7. Click **Save**

### Step 5: Redeploy

1. Go to **Deployments** tab
2. Click the **⋮** menu on the latest deployment
3. Click **Redeploy**
4. Wait 1-2 minutes for deployment to complete

### Step 6: Test

Visit your calendar - events should now appear!

---

## Alternative: Use Service Account Calendar

If you don't want to share your calendar, the service account has its own calendar where events are created. However, this calendar is not visible in your Google Calendar UI by default.

To view service account calendar events:
1. Events are created successfully (API returns success)
2. But they're in the service account's own calendar
3. You can still verify via the API that events exist

---

## Troubleshooting

### "Not Found" Error
- Service account doesn't have access to the calendar
- Double-check you shared with the correct email
- Ensure permission is "Make changes to events" not just "See all event details"

### Events Created But Not Visible
- Check you're looking at the right calendar
- In Google Calendar, make sure the calendar is checked/visible
- Wait 1-2 minutes for sync

### Still Not Working
- Test the API directly:
  ```bash
  curl -X POST https://voice-scheduling-agent-v2.vercel.app/api/create-event \
    -H "Content-Type: application/json" \
    -d '{
      "attendeeName": "Test",
      "summary": "Test Meeting",
      "startDateTime": "2026-03-30T17:00:00",
      "endDateTime": "2026-03-30T18:00:00",
      "timeZone": "UTC"
    }'
  ```
- Check Vercel logs for detailed error messages
