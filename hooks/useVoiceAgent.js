/**
 * hooks/useVoiceAgent.js
 *
 * Orchestrates the complete voice loop:
 *
 *   Mic → Deepgram (STT) → /api/chat (Bedrock LLM) → /api/create-event → /api/speak (Polly TTS) → Speaker
 *
 * State machine:
 *   idle → connecting → greeting → listening → thinking → speaking → listening → ... → ended
 *
 * FIXES APPLIED (March 20, 2026):
 * 1. Deepgram: Using ScriptProcessor with raw PCM linear16 encoding @ 16kHz
 *    (was: MediaRecorder webm/opus which Deepgram couldn't decode)
 * 2. Audio: Using AudioContext for playback (bypasses browser autoplay policy)
 * 3. Bedrock: Message deduplication and role alternation enforced in chat.js
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

/**
 * Agent status constants
 */
export const AGENT_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  GREETING: 'greeting',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ENDED: 'ended',
  ERROR: 'error',
};

/**
 * Custom hook that manages the complete voice agent lifecycle
 */
export function useVoiceAgent() {
  const [status, setStatus] = useState(AGENT_STATUS.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [liveText, setLiveText] = useState('');
  const [eventLink, setEventLink] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const messagesRef = useRef([]);
  const dgRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const analyserRef = useRef(null);
  const listeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const abortRef = useRef(false);
  const audioChunkCountRef = useRef(0);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function addMessage(role, text) {
    messagesRef.current = [...messagesRef.current, { role, content: text }];
    setTranscript((prev) => [...prev, { role, text }]);
  }

  /**
   * Play audio using Web Audio API (bypasses autoplay policy)
   * AudioContext is created/resumed on user click, keeping gesture context alive
   */
  async function speakText(text) {
    if (abortRef.current) return;
    setStatus(AGENT_STATUS.SPEAKING);
    isSpeakingRef.current = true;

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Polly TTS failed: ${res.status}`);

      const arrayBuffer = await res.arrayBuffer();
      
      // Use AudioContext that was created on user click
      const ctx = audioCtxRef.current;
      if (!ctx) {
        console.warn('[speak] AudioContext not initialized, skipping audio playback');
        return;
      }

      // Resume context if suspended (browser policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      await new Promise((resolve, reject) => {
        source.onended = resolve;
        source.onerror = reject;
        source.start(0);
      });
    } catch (err) {
      console.warn('[speak] Audio playback error (non-fatal):', err.message);
      // Don't fail the flow for audio issues - continue with text only
    } finally {
      isSpeakingRef.current = false;
    }
  }

  /**
   * Send user input to the LLM and handle the response
   */
  async function sendToLLM(userText) {
    if (abortRef.current) return;
    addMessage('user', userText);
    setStatus(AGENT_STATUS.THINKING);
    setLiveText('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesRef.current }),
      });
      const result = await res.json();

      if (result.type === 'tool_call' && result.toolName === 'schedule_meeting') {
        // Stop listening during booking
        listeningRef.current = false;

        const bookRes = await fetch('/api/create-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.toolInput),
        });
        const booking = await bookRes.json();

        let confirmText;
        if (booking.success) {
          setEventLink(booking.eventLink);
          confirmText = `Your meeting has been booked! I've added "${booking.summary}" to your calendar. You can view it at: ${booking.eventLink}`;
        } else {
          confirmText = `I'm sorry, there was a problem creating the event: ${booking.error}. Please try again.`;
        }

        addMessage('assistant', confirmText);
        await speakText(confirmText);
        setStatus(AGENT_STATUS.ENDED);
        stopListening('booking-complete');
        return;
      }

      // Regular text response
      const replyText = result.text || '';
      addMessage('assistant', replyText);
      await speakText(replyText);

      if (!abortRef.current) {
        // Re-enable user listening for the next turn.
        listeningRef.current = true;
        setStatus(AGENT_STATUS.LISTENING);
      }
    } catch (err) {
      console.error('[llm]', err);
      setErrorMsg('Something went wrong. Please try again.');
      setStatus(AGENT_STATUS.ERROR);
    }
  }

  // ── Deepgram connection ──────────────────────────────────────────────────

  async function startDeepgram() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Deepgram connection timeout (10s)'));
      }, 10000);

      fetch('/api/deepgram-token')
        .then(res => {
          if (!res.ok) throw new Error(`Failed to get Deepgram token: ${res.status}`);
          return res.json();
        })
        .then(({ key }) => {
          const client = createClient(key);

          // Use explicit encoding params for raw PCM audio
          const connection = client.listen.live({
            model: 'nova-3',
            language: 'en',
            encoding: 'linear16',      // Raw PCM (not webm/opus)
            sample_rate: '16000',      // 16kHz sample rate
            smart_format: true,
            interim_results: true,
            // Lower endpointing so the assistant stops "listening" sooner.
            utterance_end_ms: 900,
            vad_events: true,
          });

          let isOpen = false;

          connection.on(LiveTranscriptionEvents.Open, () => {
            isOpen = true;
            clearTimeout(timeout);
            console.log('[Deepgram] connection open - ready to receive PCM audio');
            resolve(connection);
          });

          connection.on(LiveTranscriptionEvents.Transcript, (data) => {
            const alt = data.channel?.alternatives?.[0];
            if (!alt) return;

            const text = alt.transcript?.trim();
            const isFinal = data.is_final;

            if (!text) return;

            if (!isFinal) {
              setLiveText(text);
              return;
            }

            setLiveText('');
            console.log('[Deepgram] final transcript:', text);

            if (listeningRef.current) {
              listeningRef.current = false;
              sendToLLM(text);
            }
          });

          connection.on(LiveTranscriptionEvents.Error, (err) => {
            console.error('[Deepgram] error', err);
            clearTimeout(timeout);
            reject(err);
          });

          connection.on(LiveTranscriptionEvents.Close, () => {
            console.log('[Deepgram] connection closed');
            isOpen = false;
            dgRef.current = null;
          });

          connection.on(LiveTranscriptionEvents.UnhandledError, (err) => {
            console.error('[Deepgram] unhandled error', err);
          });

          dgRef.current = connection;

          // Keepalive
          const keepalive = setInterval(() => {
            if (isOpen && dgRef.current) {
              try {
                dgRef.current.keepAlive();
              } catch (e) {
                clearInterval(keepalive);
              }
            } else {
              clearInterval(keepalive);
            }
          }, 10000);
        })
        .catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  function stopListening(caller = 'unknown') {
    console.log(`[stopListening] Called from: ${caller}`);
    listeningRef.current = false;

    // Close Deepgram
    if (dgRef.current) {
      dgRef.current.finish();
      dgRef.current = null;
    }

    // Stop ScriptProcessor
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    // Stop analyser
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    console.log('[stopListening] Cleanup complete');
  }

  /**
   * Start microphone using ScriptProcessor for raw PCM audio
   * This sends linear16 PCM @ 16kHz to Deepgram (required format)
   */
  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }
    });
    streamRef.current = stream;

    const audioContext = audioCtxRef.current;
    const source = audioContext.createMediaStreamSource(stream);

    // Set up analyser for visualizer
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyserRef.current = analyser;
    source.connect(analyser);

    const updateAudioLevel = () => {
      if (!analyserRef.current || !listeningRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(100, (average / 255) * 100));
      requestAnimationFrame(updateAudioLevel);
    };
    updateAudioLevel();

    // ScriptProcessor for raw PCM audio (Deepgram requirement)
    // 4096 buffer size = ~250ms chunks at 16kHz
    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessorRef.current = scriptProcessor;

    // Deepgram SDK can expose connection state differently by version.
    // Accept string and numeric open states.
    const isDeepgramConnectionOpen = () => {
      const conn = dgRef.current;
      if (!conn) return false;

      if (typeof conn.getReadyState === 'function') {
        const state = conn.getReadyState();
        if (state === 1 || state === 'open') return true;
      }

      return conn.readyState === 1 || conn.readyState === 'open';
    };

    scriptProcessor.onaudioprocess = (e) => {
      if (!isDeepgramConnectionOpen()) return;
      // Only stream mic audio while we're expecting the user's next utterance.
      if (!listeningRef.current) return;
      if (isSpeakingRef.current) return; // Don't send audio while speaking

      const float32 = e.inputBuffer.getChannelData(0);

      // Calculate RMS to check if there's actual audio
      const rms = Math.sqrt(float32.reduce((sum, val) => sum + val * val, 0) / float32.length);
      // Do NOT skip silence entirely: Deepgram's endpointing/VAD needs some frames
      // after speech to reliably detect the end of the user's utterance.

      // Convert Float32 (-1 to 1) to Int16 PCM (-32768 to 32767)
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      try {
        dgRef.current.send(int16.buffer);
        // Log first few chunks only
        if (audioChunkCountRef.current < 5) {
          console.log(
            `[ScriptProcessor] Sent audio chunk #${audioChunkCountRef.current + 1}: ${int16.buffer.byteLength} bytes, RMS: ${rms.toFixed(3)}`
          );
          audioChunkCountRef.current++;
        }
      } catch (err) {
        console.error('[ScriptProcessor] Error sending audio:', err);
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    console.log('[Mic] ScriptProcessor started - sending PCM linear16 @ 16kHz');
  }

  // ── Public API ───────────────────────────────────────────────────────────

  const startCall = useCallback(async () => {
    abortRef.current = false;
    listeningRef.current = true;
    messagesRef.current = [];
    setTranscript([]);
    setLiveText('');
    setEventLink(null);
    setErrorMsg(null);
    setAudioLevel(0);
    audioChunkCountRef.current = 0;
    setStatus(AGENT_STATUS.CONNECTING);

    try {
      // Create AudioContext on user click (preserves gesture context for audio playback)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        });
      }
      
      // Resume context (may be suspended by browser)
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      console.log('[startCall] AudioContext ready');

      // Start Deepgram first
      console.log('[startCall] Connecting to Deepgram...');
      await startDeepgram();
      console.log('[startCall] Deepgram connected');

      // Then start mic
      console.log('[startCall] Starting microphone...');
      await startMic();
      console.log('[startCall] Mic started');

      // Kick off with greeting
      setStatus(AGENT_STATUS.GREETING);
      const greetRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      });
      const greetData = await greetRes.json();
      const greeting = greetData.text || "Hi! I'm your scheduling assistant. What's your name?";

      addMessage('assistant', greeting);

      // Play greeting using AudioContext (not HTML5 Audio)
      console.log('[startCall] Playing greeting...');
      await speakText(greeting).catch((err) => {
        console.log('[startCall] Audio playback error (continuing):', err.message);
      });

      if (!abortRef.current) {
        listeningRef.current = true;
        setStatus(AGENT_STATUS.LISTENING);
        console.log('[startCall] Now listening for your response');
      }
    } catch (err) {
      console.error('[startCall]', err);
      setErrorMsg(
        err.message.includes('Permission') || err.message.includes('denied')
          ? 'Microphone access was denied. Please allow mic access and try again.'
          : err.message
      );
      setStatus(AGENT_STATUS.ERROR);
      stopListening('startCall-error');
    }
  }, []);

  const stopCall = useCallback(() => {
    abortRef.current = true;
    stopListening('stopCall-user');
    setStatus(AGENT_STATUS.ENDED);
    setLiveText('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopListening('cleanup-unmount');
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  return { status, transcript, liveText, eventLink, errorMsg, audioLevel, startCall, stopCall };
}
