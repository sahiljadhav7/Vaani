import { useEffect } from 'react'
import { socket } from './socket.js'

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
export const subtitlesSupported = !!Recognition
// Retrying these would only loop: the mic or the speech service is blocked.
const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']

// Browser speech path (ADR 0001): recognises your own mic and sends it as live Subtitles and final Utterances.
export function useSubtitles(active) {
  useEffect(() => {
    if (!active || !Recognition) return
    const rec = new Recognition()
    rec.lang = 'en-IN'
    rec.continuous = true
    rec.interimResults = true
    const send = (text, final) => socket.emit('subtitle', { text, final })
    let stopped = false
    let restartTimer
    let failures = 0 // in a row; backs off when, say, two tabs keep aborting each other's recognition

    rec.onresult = (e) => {
      failures = 0
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim()
        if (!e.results[i].isFinal) interim += `${text} `
        else if (text) send(text.slice(0, 1000), true)
      }
      // Also sent when empty, so a finished sentence clears the Subtitle on the other side.
      send(interim.trim().slice(-1000), false)
    }
    rec.onerror = (e) => {
      if (stopped) return // our own abort() reports 'aborted'
      if (FATAL.includes(e.error)) stopped = true
      else if (e.error !== 'no-speech') failures++
      console.warn('[subtitles]', e.error)
    }
    // Recognition ends by itself on silence; onend also fires after our own abort(), hence the flag.
    rec.onend = () => {
      if (stopped) return
      send('', false)
      restartTimer = setTimeout(() => {
        try {
          rec.start()
        } catch (err) {
          console.warn('[subtitles] restart', err)
        }
      }, Math.min(300 * 2 ** failures, 10_000))
    }
    rec.start()

    return () => {
      stopped = true
      clearTimeout(restartTimer)
      rec.abort()
      // A half-spoken Subtitle would otherwise hang on the other screen after Mute.
      send('', false)
    }
  }, [active])
}

// Sarvam path (ADR 0001): streams your mic to the server, which sends back the Subtitles.
// Torn down while Muted, since Sarvam bills every second of audio it gets, silence included.
export function useSarvamAudio(active, mic) {
  useEffect(() => {
    if (!active || !mic) return
    const ctx = new AudioContext()
    // After a reload there was no click yet, so the browser may hold the context suspended until one.
    const resume = () => ctx.resume().catch(() => {})
    document.addEventListener('pointerdown', resume, { once: true })
    ctx.audioWorklet.addModule(new URL('./pcm16k.worklet.js', import.meta.url)).then(() => {
      if (ctx.state === 'closed') return
      // No outputs: the browser still runs it, and nothing is played back.
      const node = new AudioWorkletNode(ctx, 'pcm16k', { numberOfOutputs: 0 })
      node.port.onmessage = (e) => socket.emit('stt-audio', e.data)
      ctx.createMediaStreamSource(mic).connect(node)
    }).catch((err) => console.warn('[stt-audio]', err))
    return () => {
      document.removeEventListener('pointerdown', resume)
      ctx.close()
    }
  }, [active, mic])
}
