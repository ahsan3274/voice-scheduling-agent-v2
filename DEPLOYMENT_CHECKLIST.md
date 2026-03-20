# ✅ Deployment Checklist

## 1 — Deepgram
- [ ] Sign up at console.deepgram.com (free $200 credit)
- [ ] Create an API key → copy to `DEEPGRAM_API_KEY`
- [ ] Copy your Project ID → copy to `DEEPGRAM_PROJECT_ID`

## 2 — AWS (Bedrock + Polly)
- [ ] Open AWS Console → IAM → create a user (or use existing)
- [ ] Attach policies: `AmazonBedrockFullAccess` + `AmazonPollyFullAccess`
- [ ] Create access keys → copy to `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- [ ] Enable Bedrock model access:
      AWS Console → Bedrock → Model access → Request `Meta Llama 3.3 70B Instruct`
      (approval is instant for most regions)

## 3 — Google Calendar
- [ ] Create a Google Cloud project
- [ ] Enable the **Google Calendar API**
- [ ] Create a Service Account → download JSON key → paste as `GOOGLE_SERVICE_ACCOUNT_JSON`
- [ ] Share your calendar with the service account email
      (calendar.google.com → ⋮ → Settings → Share with people → "Make changes to events")

## 4 — Deploy to Vercel
- [ ] Push code to GitHub
- [ ] Import repo in Vercel
- [ ] Add all env vars in Vercel → Settings → Environment Variables:
  - `DEEPGRAM_API_KEY`
  - `DEEPGRAM_PROJECT_ID`
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `BEDROCK_MODEL_ID`
  - `POLLY_VOICE_ID`
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `GOOGLE_CALENDAR_ID`
- [ ] Deploy

## 5 — Smoke tests
- [ ] Visit `/api/health` — all values should be `true`
- [ ] Test calendar directly:
  ```bash
  curl -X POST https://YOUR_APP.vercel.app/api/create-event \
    -H "Content-Type: application/json" \
    -d '{"attendeeName":"Test","summary":"Smoke Test","startDateTime":"2025-04-10T14:00:00","endDateTime":"2025-04-10T15:00:00","timeZone":"UTC"}'
  ```
- [ ] Confirm event appears in Google Calendar
- [ ] Open app → click orb → complete a full voice booking end-to-end
- [ ] Record Loom video

## 6 — Final submission
- [ ] Update `README.md` with your deployed URL
- [ ] Add screenshot of the UI + a created calendar event
- [ ] Add Loom link to README
- [ ] Confirm `.env.local` is NOT committed (`git status`)
- [ ] Push to `main` and share repo link
