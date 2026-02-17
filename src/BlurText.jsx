import React, { useEffect } from 'react'
import './App.css'

// Simple blur-reveal component supporting chars or words
export default function BlurText({
  text = '',
  delay = 0,
  speed = 40, // ms between items
  animateBy = 'chars', // 'chars' or 'words'
  direction = 'top',
  onAnimationComplete,
  className = '',
}) {
  useEffect(() => {
    if (!text) return

    const items = animateBy === 'words' ? text.split(/\s+/) : Array.from(text)
    const totalMs = delay + items.length * speed + 500 // allow animation time
    let t = setTimeout(() => {
      if (typeof onAnimationComplete === 'function') onAnimationComplete()
    }, totalMs)

    return () => clearTimeout(t)
  }, [text, delay, speed, animateBy, onAnimationComplete])

  if (!text) return null

  if (animateBy === 'words') {
    const words = text.split(/(\s+)/) // keep whitespace tokens
    return (
      <span className={className + ' blur-text'} aria-hidden="false">
        {words.map((w, i) => {
          // if token is whitespace, render as-is
          if (/^\s+$/.test(w)) return <span key={i}>{w}</span>
          return (
            <span
              key={i}
              className="blur-word"
              style={{ animationDelay: `${delay + i * speed}ms` }}
            >
              {w}
            </span>
          )
        })}
      </span>
    )
  }

  // default: render per-character
  return (
    <span className={className + ' blur-text'} aria-hidden="false">
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="blur-char"
          style={{ animationDelay: `${delay + i * speed}ms` }}
        >
          {ch}
        </span>
      ))}
    </span>
  )
}
