import { Box } from '@mui/material'
import { keyframes } from '@mui/material/styles'

// Adapted from VengeanceUI's Flip Text: each letter is a cube face that rolls over to the next.
const flip = keyframes`
  0% { transform: rotateX(0deg); }
  25%, 100% { transform: rotateX(90deg); }
`
const fade = keyframes`
  0% { opacity: 1; }
  30%, 100% { opacity: var(--opacity, 0); }
`
const timing = 'var(--flip-duration) var(--flip-delay) infinite ease'

const sx = {
  display: 'inline-block',
  perspective: '1000px',
  '& .flip-char': {
    display: 'inline-block',
    position: 'relative',
    transformStyle: 'preserve-3d',
    WebkitTextFillColor: 'transparent',
    height: '1.2em',
    lineHeight: '1.2em',
    verticalAlign: 'middle',
    animation: `${flip} ${timing}`,
  },
  '& .flip-char::before, & .flip-char::after': {
    content: 'attr(data-char)',
    WebkitTextFillColor: 'currentColor',
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    animation: `${fade} ${timing}`,
  },
  '& .flip-char::after': { transform: 'translate(-50%, -50%) translateZ(0.6em)' },
  '& .flip-char::before': { transform: 'translate(-50%, -50%) rotateX(-90deg) translateZ(0.6em)', opacity: 0, '--opacity': 1 },
  '@media (prefers-reduced-motion: reduce)': {
    '& .flip-char, & .flip-char::before, & .flip-char::after': { animation: 'none' },
  },
}
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }

export default function FlipText({ children, duration = 2.2 }) {
  let index = 0
  return (
    <Box component="span" sx={sx}>
      <Box component="span" sx={srOnly}>{children}</Box>
      {children.split(' ').map((word, w) => (
        <span key={w} aria-hidden="true">
          {w > 0 && ' '}
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap', transformStyle: 'preserve-3d' }}>
            {[...word].map((char, c) => {
              const delay = Math.sin((index++ / children.length) * (Math.PI / 2)) * duration * 0.25
              return (
                <span key={c} className="flip-char" data-char={char} style={{ '--flip-duration': `${duration}s`, '--flip-delay': `${delay}s` }}>
                  {char}
                </span>
              )
            })}
          </span>
        </span>
      ))}
    </Box>
  )
}
