import { useEffect } from 'react'
import { socket } from './socket.js'

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
export const subtitlesSupported = !!Recognition
export const LANGUAGES = { 'en-IN': 'English', 'hi-IN': 'हिन्दी', 'mr-IN': 'मराठी' }
// Retrying these would only loop: the mic or the speech service is blocked.
const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']

// Browser speech path (ADR 0001): recognises your own mic and sends it as live Subtitles and final Utterances.
export function useSubtitles(active, lang) {
  useEffect(() => {
    if (!active || !Recognition) return
    const rec = new Recognition()
    rec.lang = lang
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
      // A half-spoken Subtitle would otherwise hang on the other screen after Mute or a language switch.
      send('', false)
    }
  }, [active, lang])
}
