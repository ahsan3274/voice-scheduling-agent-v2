import { useVoiceAgent, AGENT_STATUS } from '../hooks/useVoiceAgent';

const STATUS_META = {
  [AGENT_STATUS.IDLE]:       { label: 'Ready',        color: '#6b7280', dot: false },
  [AGENT_STATUS.CONNECTING]: { label: 'Connecting…',  color: '#f59e0b', dot: true  },
  [AGENT_STATUS.GREETING]:   { label: 'Starting…',    color: '#a78bfa', dot: true  },
  [AGENT_STATUS.LISTENING]:  { label: 'Listening',    color: '#10b981', dot: true  },
  [AGENT_STATUS.THINKING]:   { label: 'Thinking…',    color: '#60a5fa', dot: true  },
  [AGENT_STATUS.SPEAKING]:   { label: 'Speaking',     color: '#f472b6', dot: true  },
  [AGENT_STATUS.ENDED]:      { label: 'Call ended',   color: '#6b7280', dot: false },
  [AGENT_STATUS.ERROR]:      { label: 'Error',        color: '#ef4444', dot: false },
};

export default function VoiceAgent() {
  const { status, transcript, liveText, eventLink, errorMsg, audioLevel, startCall, stopCall } = useVoiceAgent();
  const meta = STATUS_META[status] || STATUS_META[AGENT_STATUS.IDLE];
  const isActive = [AGENT_STATUS.CONNECTING, AGENT_STATUS.GREETING, AGENT_STATUS.LISTENING, AGENT_STATUS.THINKING, AGENT_STATUS.SPEAKING].includes(status);
  const isSpeaking = status === AGENT_STATUS.SPEAKING;
  const isListening = status === AGENT_STATUS.LISTENING;
  const isThinking = status === AGENT_STATUS.THINKING;

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">

      {/* ── Orb ─────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        {isActive && (
          <span className="absolute inset-0 rounded-full pulse-ring"
            style={{ background: `radial-gradient(circle, ${meta.color}22 0%, transparent 70%)` }} />
        )}
        <button
          onClick={isActive ? stopCall : startCall}
          disabled={status === AGENT_STATUS.CONNECTING || status === AGENT_STATUS.GREETING}
          className="relative z-10 flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-0 disabled:opacity-50"
          style={{
            width: 120, height: 120,
            background: isActive ? `linear-gradient(135deg, #7c3aed, #4f46e5)` : 'linear-gradient(135deg, #1e1e2e, #2a2a3e)',
            boxShadow: isActive ? `0 0 40px ${meta.color}99, 0 0 80px ${meta.color}33` : '0 4px 24px rgba(0,0,0,0.4)',
          }}
          aria-label={isActive ? 'End call' : 'Start call'}
        >
          {status === AGENT_STATUS.CONNECTING || status === AGENT_STATUS.GREETING
            ? <Spinner />
            : isSpeaking ? <WaveIcon color="#f472b6" />
            : isListening ? <MicVisualizer level={audioLevel} />
            : isThinking ? <ThinkingDots />
            : isActive ? <MicIcon />
            : <PhoneIcon />}
        </button>
      </div>

      {/* ── Status pill ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium"
           style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: meta.dot ? `0 0 8px ${meta.color}` : 'none' }} />
        <span style={{ color: meta.color }}>{meta.label}</span>
      </div>

      {/* ── Error ───────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="w-full px-4 py-3 rounded-2xl text-sm"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
          {errorMsg}
        </div>
      )}

      {/* ── Success banner ──────────────────────────────────────── */}
      {eventLink && (
        <a href={eventLink} target="_blank" rel="noopener noreferrer"
           className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl hover:opacity-90 transition-opacity"
           style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', textDecoration: 'none' }}>
          <span className="text-2xl">📅</span>
          <div>
            <p className="text-sm font-semibold">Meeting booked successfully!</p>
            <p className="text-xs opacity-70 mt-0.5">Click to open in Google Calendar →</p>
          </div>
        </a>
      )}

      {/* ── Idle hint ───────────────────────────────────────────── */}
      {(status === AGENT_STATUS.IDLE || status === AGENT_STATUS.ENDED) && !eventLink && (
        <p className="text-sm text-center" style={{ color: '#6b7280' }}>
          {status === AGENT_STATUS.ENDED
            ? 'Call ended. Click the button to start a new booking.'
            : 'Click the button to start talking to your scheduling assistant.'}
        </p>
      )}

      {/* ── Live interim transcript ──────────────────────────────── */}
      {liveText && (
        <div className="w-full px-4 py-2 rounded-xl text-sm italic"
             style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', color: '#9ca3af' }}>
          {liveText}…
        </div>
      )}

      {/* ── Conversation transcript ──────────────────────────────── */}
      {transcript.length > 0 && (
        <div className="w-full rounded-2xl p-4 flex flex-col gap-3 overflow-y-auto max-h-80"
             style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {transcript.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                   style={msg.role === 'user'
                     ? { background: 'rgba(124,58,237,0.25)', color: '#e5e7eb', borderBottomRightRadius: 4 }
                     : { background: 'rgba(255,255,255,0.07)', color: '#d1d5db', borderBottomLeftRadius: 4 }}>
                <span className="block text-xs font-semibold mb-1 opacity-50">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Stack badge ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-xs" style={{ color: '#374151' }}>
        <span>Deepgram Nova-3</span>
        <span>·</span>
        <span>Claude 3 Haiku</span>
        <span>·</span>
        <span>AWS Polly</span>
      </div>
    </div>
  );
}

// ── Micro-components ─────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function MicVisualizer({ level = 0 }) {
  // Scale bars based on audio level
  const scale = Math.max(0.3, level / 100);
  return (
    <div className="flex items-end gap-1" style={{ height: 34 }}>
      {[8, 14, 20, 14, 8].map((h, i) => (
        <div 
          key={i} 
          className="wave-bar rounded-full" 
          style={{ 
            width: 5, 
            height: h * scale, 
            background: level > 50 ? '#10b981' : '#60a5fa',
            transformOrigin: 'bottom',
            transition: 'height 0.1s ease'
          }} 
        />
      ))}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function WaveIcon({ color = '#f472b6' }) {
  return (
    <div className="flex items-end gap-0.5" style={{ height: 34 }}>
      {[10, 20, 28, 20, 10].map((h, i) => (
        <div key={i} className="wave-bar rounded-full" style={{ width: 5, height: h, background: color, transformOrigin: 'bottom' }} />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="thinking-dot rounded-full" style={{ width: 10, height: 10, background: '#60a5fa' }} />
      ))}
    </div>
  );
}

function Spinner() {
  return <div className="rounded-full border-2 border-white/20 border-t-white animate-spin" style={{ width: 30, height: 30 }} />;
}
