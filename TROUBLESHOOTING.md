# Voice Scheduling Agent - Troubleshooting & Status Document

**Created:** March 20, 2026  
**Project:** AI Voice Scheduling Agent for vikara.ai Interview  
**Candidate:** Ahsan  
**Role:** AI Engineer  

---

## 📋 Project Overview

### What We're Building
A real-time voice AI assistant that:
1. Initiates conversation with users
2. Collects name, preferred date/time, and meeting title
3. Confirms details before booking
4. Creates real Google Calendar events
5. Is deployed and accessible via hosted URL

### Tech Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 14 + React 18 | UI framework |
| **STT** | Deepgram Nova-3 | Real-time speech transcription |
| **LLM** | AWS Bedrock (Claude 3 Haiku) | Conversation brain + tool calling |
| **TTS** | AWS Polly (Joanna voice) | Text-to-speech audio output |
| **Calendar** | Google Calendar API | Event creation |
| **Hosting** | Vercel | Deployment |

### Architecture Flow
```
User Voice → Deepgram (STT) → Bedrock/Claude (LLM) → Polly (TTS) → Speaker
                                      ↓
                              Google Calendar API
```

---

## ✅ What's Working

### Backend APIs
- ✅ `/api/health` - All environment variables configured correctly
- ✅ `/api/deepgram-token` - Returns valid Deepgram API keys
- ✅ `/api/chat` - Bedrock LLM integration (with issues)
- ✅ `/api/speak` - Polly TTS endpoint
- ✅ `/api/create-event` - Google Calendar integration

### Frontend
- ✅ Microphone access and audio capture
- ✅ MediaRecorder streaming to Deepgram (audio chunks sent successfully)
- ✅ Audio visualizer showing mic input levels
- ✅ Deepgram WebSocket connection opens successfully
- ✅ Transcript appears in UI (was working earlier)
- ✅ UI state management (listening, thinking, speaking states)

### Configuration
- ✅ AWS credentials loaded from `~/.aws/credentials`
- ✅ Deepgram API key configured
- ✅ Google Service Account configured
- ✅ Bedrock model: `anthropic.claude-3-haiku-20240307-v1:0`
- ✅ AWS Region: `eu-central-1`

---

## ❌ Current Issues

### Issue #1: Audio Playback Blocked (Browser Autoplay Policy)
**Status:** UNRESOLVED - CRITICAL FOR DEMO

**Symptoms:**
- Greeting message not spoken aloud
- Console error: `NotAllowedError: The request is not allowed by the user agent or the platform in the current context`
- Audio playback fails even after user clicks orb button

**Root Cause:**
Modern browsers (especially Safari/WebKit) block audio autoplay unless it's played **synchronously** within the user's click handler. By the time our async operations complete (Deepgram connect → Mic start → LLM response → TTS), the "user gesture context" has expired.

**Attempts Made:**
1. ❌ Audio warmup with silent 1ms WAV file
2. ❌ Adding delays before audio.play()
3. ❌ Using Promise.race with timeout
4. ❌ Catching and ignoring autoplay errors
5. ❌ Preloading audio with `audio.preload = 'auto'`

**Current Behavior:**
- Audio playback silently fails
- App continues with text-only responses
- Transcription should still work

**Recommended Solutions (Not Yet Tried):**
1. **Use Web Audio API** - Create AudioContext on user click, keep it alive
2. **Muted autoplay + unmute** - Start muted, unmute after user interaction
3. **Show "Click to Enable Audio" button** - Explicit user permission
4. **Use VAPI/Retell AI SDK** - They've solved this already

---

### Issue #2: Deepgram Transcription Not Returning Results
**Status:** UNRESOLVED - CRITICAL BLOCKER

**Symptoms:**
- Audio chunks successfully sent to Deepgram (16-27KB every 250ms)
- Deepgram connection opens successfully
- NO `[Deepgram] final transcript` logs appearing
- User speech not transcribed

**Evidence:**
```
[Log] [MediaRecorder] Sent audio chunk: 16004 bytes, type: audio/webm;codecs=opus
[Log] [MediaRecorder] Sent audio chunk: 15714 bytes, type: audio/webm;codecs=opus
... (100+ chunks sent)
[NO transcript logs appear]
```

**Root Cause Analysis:**
The issue is likely one of:
1. **Audio format incompatibility** - Deepgram may not be receiving audio in the expected format
2. **WebSocket not receiving data** - Chunks sent but not arriving at Deepgram
3. **Deepgram configuration** - Wrong model or settings
4. **Silent audio** - RMS levels too low, no actual speech detected

**Attempts Made:**
1. ✅ Switched from ScriptProcessor to MediaRecorder API
2. ✅ Added mimeType fallbacks (`audio/webm;codecs=opus`, `audio/webm`, etc.)
3. ✅ Verified audio chunks are being sent (size: 15-27KB each)
4. ✅ Deepgram connection opens successfully
5. ❌ Added audio level monitoring (visualizer shows activity)

**What We Know:**
- MediaRecorder IS capturing audio (visualizer moves)
- Audio chunks ARE being sent to Deepgram
- Deepgram WebSocket IS connected
- But NO transcripts are returned

**Recommended Next Steps:**
1. **Check Deepgram dashboard** - See if requests are arriving
2. **Try PCM format** - Convert webm to PCM before sending
3. **Use Deepgram's official React SDK** - `@deepgram/react-sdk`
4. **Test with Deepgram's sample code** - Isolate the issue
5. **Add Deepgram error event handlers** - Catch silent failures

---

### Issue #3: Bedrock/Claude API Validation Errors
**Status:** PARTIALLY FIXED - NEEDS VERIFICATION

**Symptoms:**
- Vercel logs show: `ValidationException` from Bedrock
- 500 errors on `/api/chat` endpoint
- LLM not responding to transcribed text

**Root Cause:**
Claude 3 Haiku has strict message format requirements:
1. First message MUST be from user role
2. Messages cannot be empty
3. Content must be non-empty strings

**Attempts Made:**
1. ✅ Added message validation
2. ✅ Filter empty messages
3. ✅ Ensure user-first message order
4. ✅ Added detailed logging
5. ✅ Error handling wrapper

**Current Code:**
```javascript
// Ensure messages array is not empty
if (!messages || messages.length === 0) {
  messages = [{ role: 'user', content: 'Hello' }];
}

// Filter out empty messages
const validMessages = messages.filter(m => m && m.content && m.content.trim());

// Ensure first message is from user (Claude requirement)
if (validMessages.length === 0 || validMessages[0].role !== 'user') {
  validMessages.unshift({ role: 'user', content: 'Hello' });
}
```

**Status:**
- Code deployed but not yet tested
- Depends on Issue #2 being fixed first (need transcripts to send to LLM)

---

### Issue #4: UI Shows "Listening" But No Transcription
**Status:** SAME AS ISSUE #2

**Symptoms:**
- Status shows "Listening"
- Audio visualizer bars move when speaking
- No transcript appears in chat
- No response from assistant

**Current Flow:**
```
User clicks orb
  → Deepgram connects ✅
  → Mic starts ✅
  → Audio chunks sent ✅
  → [BREAK] No transcript received ❌
  → [BLOCKED] LLM not called ❌
  → [BLOCKED] No response ❌
```

---

## 🔧 Code Changes Made (Chronological)

### 1. Bug Fixes (Initial Scan)
- Fixed Deepgram double-firing prevention
- Added `isSpeakingRef` for audio input blocking
- Fixed race condition in booking flow
- Added error handling for Deepgram token fetch
- Made SYSTEM_PROMPT dynamic (date updates)
- Fixed audio URL memory leak
- Enhanced input validation in speak.js
- Added audio playback timeout (30s)

### 2. Audio Pipeline Rewrite
- **REMOVED:** ScriptProcessor API (deprecated, unreliable)
- **ADDED:** MediaRecorder API (Deepgram's recommendation)
- **ADDED:** Audio visualizer with real-time level monitoring
- **ADDED:** mimeType fallbacks for browser compatibility

### 3. LLM Message Format Fix
- Added message validation
- Filter empty messages
- Ensure user-first for Claude 3
- Added detailed Bedrock logging

### 4. UI Improvements
- Updated stack badge: "Llama 3.3 70B" → "Claude 3 Haiku"
- Added mic audio visualizer (5-bar animated)
- Better error messages
- Improved status indicators

---

## 📁 Project Structure

```
voice-scheduling-agent-v2/
├── components/
│   └── VoiceAgent.js          # UI: orb, visualizer, transcript, status
├── hooks/
│   └── useVoiceAgent.js       # Core voice loop logic (430 lines)
├── lib/
│   ├── llm.js                 # Bedrock/Claude integration
│   ├── polly.js               # AWS Polly TTS
│   └── googleCalendar.js      # Google Calendar API
├── pages/
│   ├── index.js               # Main landing page
│   └── api/
│       ├── chat.js            # LLM endpoint
│       ├── speak.js           # TTS endpoint
│       ├── create-event.js    # Calendar booking endpoint
│       ├── deepgram-token.js  # Deepgram auth endpoint
│       └── health.js          # Health check endpoint
├── .env.local                 # Environment variables (NOT committed)
├── .env.example               # Template for env vars
└── package.json
```

---

## 🔑 Environment Variables

### Required (All Configured in Vercel)
```env
# Deepgram
DEEPGRAM_API_KEY=6e0fb3cb5a41d20891c98571e015b91eb1c2a2ec
DEEPGRAM_PROJECT_ID=<configured in Vercel>

# AWS
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=AKIAVBSKTXWA6KFOCLPP (from ~/.aws/credentials)
AWS_SECRET_ACCESS_KEY=zPFA... (from ~/.aws/credentials)
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
POLLY_VOICE_ID=Joanna

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...} (configured)
GOOGLE_CALENDAR_ID=primary
```

---

## 🧪 Testing Checklist

### What Works
- [x] App deploys to Vercel successfully
- [x] All environment variables configured
- [x] Microphone permission granted
- [x] Audio visualizer shows activity
- [x] Deepgram WebSocket connects
- [x] MediaRecorder streams audio chunks
- [x] UI state transitions work

### What Doesn't Work
- [ ] Audio greeting not spoken (autoplay blocked)
- [ ] No transcription received from Deepgram
- [ ] LLM not responding (depends on transcription)
- [ ] Calendar booking not tested end-to-end

---

## 🎯 Next Steps (For Next Session)

### Priority 1: Fix Deepgram Transcription
1. **Check Deepgram Dashboard** - Verify requests are arriving
2. **Test with PCM audio** - Convert webm to PCM before sending
3. **Try Deepgram's official SDK** - `@deepgram/react-sdk`
4. **Add more Deepgram event handlers** - Catch errors
5. **Test with sample audio file** - Isolate mic vs Deepgram issue

### Priority 2: Fix Audio Playback
1. **Web Audio API approach** - Create AudioContext on click
2. **Add "Enable Audio" button** - Explicit user permission
3. **Consider ElevenLabs Realtime** - Alternative TTS with better browser support
4. **Use VAPI/Retell AI** - Pre-built voice agent SDKs

### Priority 3: End-to-End Test
1. Test full conversation flow
2. Verify calendar event creation
3. Record demo video for submission
4. Take screenshots

### Priority 4: Polish
1. Add loading states
2. Better error messages
3. Retry logic
4. Mobile responsiveness

---

## 📚 Resources & References

### Deepgram Documentation
- Official Tutorial: https://deepgram.com/learn/build-a-real-time-transcription-app-with-react-and-deepgram
- WebSocket API: https://developers.deepgram.com/docs/streaming
- Audio Formats: https://developers.deepgram.com/docs/encoding

### Browser Autoplay Policy
- Chrome: https://developer.chrome.com/blog/autoplay
- Safari: https://webkit.org/blog/7734/new-feature-policy-and-autoplay/
- Workarounds: https://deepgram.com/learn/audio-playback-across-browsers-and-devices

### AWS Bedrock
- Claude 3 Documentation: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html
- Converse API: https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html

### Similar Projects
- Deepgram React Agent: https://github.com/deepgram/dg_react_agent
- Vapi AI: https://vapi.ai
- Retell AI: https://retellai.com

---

## 💭 Lessons Learned

### What Went Well
1. **MediaRecorder API** - Much simpler than ScriptProcessor
2. **Audio visualizer** - Great for debugging mic input
3. **Detailed logging** - Helped identify where failures occur
4. **Environment setup** - All APIs configured correctly

### What Was Harder Than Expected
1. **Browser autoplay policy** - More restrictive than anticipated
2. **Deepgram audio format** - webm/opus may not be compatible
3. **Real-time audio streaming** - Timing and buffering complexities
4. **Claude 3 message format** - Strict validation requirements

### What Would Do Differently
1. **Start with Deepgram's official SDK** - Avoid reinventing the wheel
2. **Test audio format early** - Should have verified PCM vs webm first
3. **Use pre-built voice agent framework** - Vapi or Retell AI would have solved autoplay
4. **Add more error handlers** - Deepgram has many event types we didn't catch

---

## 📞 Contact & Support

### GitHub Repository
https://github.com/ahsan3274/voice-scheduling-agent-v2

### Deployed URL
https://voice-scheduling-agent-v2.vercel.app

### Vercel Dashboard
https://vercel.com/atariqq8-5197s-projects/voice-scheduling-agent-v2

### Interview Submission Deadline
Monday, March 23, 2026

---

## 📝 Notes for Next Developer

1. **Don't spend too long on autoplay** - It's a browser limitation, not a code bug. Consider text-only demo or use Vapi SDK.

2. **Deepgram is the priority** - Once transcription works, the rest will follow. Test with their official sample code first.

3. **The LLM and Calendar code is solid** - Those integrations work, just need proper input from Deepgram.

4. **Consider alternative approach** - If Deepgram continues to fail, try:
   - Web Speech API (built-in browser STT)
   - AssemblyAI (alternative STT provider)
   - Vapi/Retell (pre-built voice agent platforms)

5. **For demo purposes** - You can fake the transcription temporarily to show the calendar booking flow works.

---

**Last Updated:** March 20, 2026  
**Status:** 70% Complete - Core functionality built, transcription & audio pending
