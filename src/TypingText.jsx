import React from 'react'

export default function TypingText({ text = '', speed = 50, className = '' }) {
  if (!text) return null

  // Render each character in its own span with staggered animation delay
  return (
    <span className={className + ' blur-text'} aria-hidden="false">
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="blur-char"
          style={{ animationDelay: `${i * speed}ms` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  )
}
