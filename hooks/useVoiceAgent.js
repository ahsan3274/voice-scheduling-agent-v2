/**
 * hooks/useVoiceAgent.js
 *
 * Orchestrates the full real-time voice loop:
 *
 *   Mic → Deepgram (STT) → /api/chat (Bedrock LLM) → /api/create-event → /api/speak (Polly TTS) → Speaker
 *
 * State machine:
 *   idle → connecting → greeting → listening → thinking → speaking → listening → ... → ended
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

/**
 * Agent status constants representing the current state of the voice agent
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
 * @returns {Object} Voice agent state and controls
 * @returns {string} status - Current agent status
 * @returns {Array} transcript - Conversation history
 * @returns {string} liveText - Live transcription text
 * @returns {string|null} eventLink - Created event link if booking succeeded
 * @returns {string|null} errorMsg - Error message if any
 * @returns {Function} startCall - Start the voice call
 * @returns {Function} stopCall - Stop the voice call
 */
export function useVoiceAgent() {
  const [status, setStatus] = useState(AGENT_STATUS.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [liveText, setLiveText] = useState('');
  const [eventLink, setEventLink] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const messagesRef = useRef([]);
  const dgRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const audioCtxRef = useRef(null);
  const listeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const abortRef = useRef(false);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Add a message to both the LLM history and UI transcript
   * @param {string} role - 'user' or 'assistant'
   * @param {string} text - Message text
   */
  function addMessage(role, text) {
    messagesRef.current = [...messagesRef.current, { role, content: text }];
    setTranscript((prev) => [...prev, { role, text }]);
  }

  /**
   * Convert text to speech using AWS Polly and play it
   * @param {string} text - Text to speak
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
      if (!res.ok) throw new Error('Polly TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      // Enable autoplay by user gesture context
      audio.preload = 'auto';
      
      try {
        await Promise.race([
          new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = reject;
            audio.play().catch(reject);
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Audio playback timeout')), 30000)
          ),
        ]);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('[speak]', err);
      // Don't show error for autoplay issues - just continue silently
      if (err.message.includes('not allowed') || err.message.includes('autoplay') || err.message.includes('play()')) {
        console.log('[speak] Autoplay blocked - continuing anyway');
        // Still set status back so UI updates
      } else {
        setErrorMsg(`Failed to play audio response: ${err.message}`);
        setStatus(AGENT_STATUS.ERROR);
      }
    } finally {
      isSpeakingRef.current = false;
    }
  }

  /**
   * Send user input to the LLM and handle the response
   * @param {string} userText - User's transcribed speech
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
        // ── Book the meeting ────────────────────────────────────────────────
        // Stop listening immediately to prevent any in-progress utterances from firing
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
        stopListening();
        return;
      }

      // ── Regular text response ───────────────────────────────────────────
      const replyText = result.text || '';
      addMessage('assistant', replyText);
      await speakText(replyText);

      if (!abortRef.current) setStatus(AGENT_STATUS.LISTENING);
    } catch (err) {
      console.error('[llm]', err);
      setErrorMsg('Something went wrong. Please try again.');
      setStatus(AGENT_STATUS.ERROR);
    }
  }

  // ── Deepgram connection ──────────────────────────────────────────────────

  async function startDeepgram() {
    return new Promise((resolve, reject) => {
      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        reject(new Error('Deepgram connection timeout'));
      }, 10000);

      // Fetch a short-lived key from our server
      fetch('/api/deepgram-token')
        .then(res => {
          if (!res.ok) throw new Error(`Failed to get Deepgram token: ${res.status}`);
          return res.json();
        })
        .then(({ key }) => {
          const client = createClient(key);

          const connection = client.listen.live({
            model: 'nova-3',
            language: 'en',
            smart_format: true,
            endpointing: 500,
            interim_results: true,
            utterance_end_ms: 1500,
            vad_events: true,
          });

          let isOpen = false;

          connection.on(LiveTranscriptionEvents.Open, () => {
            isOpen = true;
            clearTimeout(timeout);
            console.log('[Deepgram] connection open - ready to receive audio');
            resolve(connection);
          });

          connection.on(LiveTranscriptionEvents.Transcript, (data) => {
            const alt = data.channel?.alternatives?.[0];
            if (!alt) return;

            const text = alt.transcript?.trim();
            const isFinal = data.is_final;

            if (!text) return;

            if (!isFinal) {
              // Show interim transcript live
              setLiveText(text);
              return;
            }

            setLiveText('');
            console.log('[Deepgram] final transcript:', text);

            // Act on final transcripts (user finished speaking)
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
            console.log('[Deepgram] Close event details:', { isOpen, hasConnection: !!dgRef.current });
            isOpen = false;
            dgRef.current = null;
          });

          connection.on(LiveTranscriptionEvents.UnhandledError, (err) => {
            console.error('[Deepgram] unhandled error', err);
          });

          dgRef.current = connection;
          
          // Keep connection alive with periodic keepalive
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

  function stopListening() {
    listeningRef.current = false;
    if (dgRef.current) {
      dgRef.current.finish();
      dgRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    }, video: false });
    streamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;

    // Resume audio context if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const source = audioCtx.createMediaStreamSource(stream);

    // ScriptProcessor fallback (broadly supported, no WASM needed)
    const bufferSize = 4096;
    const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    let audioChunkCount = 0;
    
    processor.onaudioprocess = (e) => {
      if (!dgRef.current) {
        console.log('[Mic] Deepgram not connected, skipping audio');
        return;
      }
      if (isSpeakingRef.current) {
        console.log('[Mic] Speaking, blocking audio input');
        return;
      }
      
      const inputData = e.inputBuffer.getChannelData(0);
      // Check if we have actual audio (not silence)
      const rms = Math.sqrt(inputData.reduce((sum, val) => sum + val * val, 0) / inputData.length);
      
      // Convert Float32 → Int16 PCM and send to Deepgram
      const pcm16 = float32ToInt16(inputData);
      try {
        dgRef.current.send(pcm16.buffer);
        audioChunkCount++;
        if (audioChunkCount % 10 === 0) {
          console.log(`[Mic] Sent ${audioChunkCount} audio chunks to Deepgram, RMS: ${rms.toFixed(4)}`);
        }
      } catch (err) {
        console.error('[Mic] Error sending audio to Deepgram:', err);
      }
    };

    source.connect(processor);
    // Don't connect to destination (speakers) - just process the data
    // processor.connect(audioCtx.destination);
    processorRef.current = processor;
    
    console.log('[Mic] started - streaming audio to Deepgram');
  }

  function float32ToInt16(buffer) {
    const result = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return result;
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
    setStatus(AGENT_STATUS.CONNECTING);

    // Overall timeout for entire startup
    const startupTimeout = setTimeout(() => {
      console.error('[startCall] Startup timeout after 15 seconds');
      setErrorMsg('Connection timed out. Please try again.');
      setStatus(AGENT_STATUS.ERROR);
      stopListening();
    }, 15000);

    try {
      // Create audio context immediately on user click (preserves gesture context)
      const tempAudio = new Audio();
      tempAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA=='; // 1ms silent WAV
      
      // This MUST be synchronous with the click
      try {
        await tempAudio.play();
        tempAudio.pause();
        console.log('[startCall] Audio warmup successful');
      } catch (e) {
        console.log('[startCall] Audio warmup failed, continuing anyway');
      }

      // Start Deepgram with timeout
      console.log('[startCall] Connecting to Deepgram...');
      await startDeepgram();
      console.log('[startCall] Deepgram connected');
      
      // Then start mic
      console.log('[startCall] Starting microphone...');
      await startMic();
      console.log('[startCall] Mic started');

      // Kick off the conversation with a greeting
      setStatus(AGENT_STATUS.GREETING);
      const greetRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
      });
      const greetData = await greetRes.json();
      const greeting = greetData.text || "Hi! I'm your scheduling assistant. What's your name?";

      addMessage('assistant', greeting);
      
      // Try to play greeting
      console.log('[startCall] Playing greeting...');
      await speakText(greeting);

      if (!abortRef.current) {
        listeningRef.current = true;
        setStatus(AGENT_STATUS.LISTENING);
        console.log('[startCall] Now listening for your response');
      }
      
      clearTimeout(startupTimeout);
    } catch (err) {
      clearTimeout(startupTimeout);
      console.error('[startCall]', err);
      setErrorMsg(err.message.includes('Permission') ? 'Microphone access was denied. Please allow mic access and try again.' : err.message);
      setStatus(AGENT_STATUS.ERROR);
      stopListening();
    }
  }, []);

  const stopCall = useCallback(() => {
    abortRef.current = true;
    stopListening();
    setStatus(AGENT_STATUS.ENDED);
    setLiveText('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopListening();
    };
  }, []);

  return { status, transcript, liveText, eventLink, errorMsg, startCall, stopCall };
}
