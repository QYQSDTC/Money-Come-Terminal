import React from 'react'

/**
 * Shared lightweight Markdown renderer for AI analysis output.
 * Supports: headings, bold, italic, bold+italic, inline code, code blocks,
 * unordered/ordered lists, horizontal rules, paragraphs.
 */

// ==================== Inline Rendering ====================

function renderInline(text: string): React.ReactNode {
  // Order matters: bold+italic (***) before bold (**) before italic (*)
  // Also handles inline code (`...`)
  const parts: React.ReactNode[] = []
  // Combined regex: inline code | bold-italic | bold | italic
  const regex = /`([^`]+)`|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1] !== undefined) {
      // Inline code
      parts.push(
        <code
          key={`c${match.index}`}
          style={{
            background: 'rgba(255,255,255,0.06)',
            padding: '1px 5px',
            borderRadius: 3,
            fontSize: '0.92em',
            fontFamily: 'Menlo, Monaco, monospace',
            color: '#d4d4e0'
          }}
        >
          {match[1]}
        </code>
      )
    } else if (match[2] !== undefined) {
      // Bold + italic
      parts.push(
        <strong key={`bi${match.index}`} style={{ color: '#e8e8ec', fontWeight: 600, fontStyle: 'italic' }}>
          {match[2]}
        </strong>
      )
    } else if (match[3] !== undefined) {
      // Bold
      parts.push(
        <strong key={`b${match.index}`} style={{ color: '#e8e8ec', fontWeight: 600 }}>
          {match[3]}
        </strong>
      )
    } else if (match[4] !== undefined) {
      // Italic
      parts.push(
        <em key={`i${match.index}`} style={{ fontStyle: 'italic', color: '#c0c0cc' }}>
          {match[4]}
        </em>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}

// ==================== Block Rendering ====================

interface MarkdownProps {
  text: string
  /** Base font size (px). Default 12 */
  fontSize?: number
}

export const MarkdownRenderer: React.FC<MarkdownProps> = ({ text, fontSize = 12 }) => {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ---- Code block ----
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++ // skip opening ```
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <pre
          key={`code-${i}`}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
            padding: '8px 10px',
            margin: '6px 0',
            fontSize: fontSize - 1,
            fontFamily: 'Menlo, Monaco, monospace',
            color: '#c8c8d4',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.5
          }}
        >
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // ---- Horizontal rule ----
    if (/^-{3,}$|^\*{3,}$/.test(line.trim())) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            margin: '10px 0'
          }}
        />
      )
      i++
      continue
    }

    // ---- Headers ----
    if (line.startsWith('#### ')) {
      elements.push(
        <h5
          key={`h4-${i}`}
          style={{
            fontSize: fontSize,
            fontWeight: 600,
            color: '#d0d0d8',
            margin: '10px 0 4px'
          }}
        >
          {renderInline(line.slice(5))}
        </h5>
      )
      i++
      continue
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h4
          key={`h3-${i}`}
          style={{
            fontSize: fontSize + 1,
            fontWeight: 600,
            color: '#e8e8ec',
            margin: '12px 0 4px'
          }}
        >
          {renderInline(line.slice(4))}
        </h4>
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3
          key={`h2-${i}`}
          style={{
            fontSize: fontSize + 2,
            fontWeight: 700,
            color: '#e8e8ec',
            margin: '14px 0 6px'
          }}
        >
          {renderInline(line.slice(3))}
        </h3>
      )
      i++
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2
          key={`h1-${i}`}
          style={{
            fontSize: fontSize + 3,
            fontWeight: 700,
            color: '#e8e8ec',
            margin: '16px 0 8px'
          }}
        >
          {renderInline(line.slice(2))}
        </h2>
      )
      i++
      continue
    }

    // ---- Unordered list ----
    if (line.match(/^\s*[-*+]\s/)) {
      const indent = line.search(/\S/)
      const level = Math.floor(indent / 2)
      elements.push(
        <div
          key={`ul-${i}`}
          style={{
            paddingLeft: 12 + level * 10,
            position: 'relative',
            margin: '2px 0',
            lineHeight: 1.7
          }}
        >
          <span style={{ position: 'absolute', left: level * 10, color: '#5c5c6a' }}>•</span>
          {renderInline(line.replace(/^\s*[-*+]\s/, ''))}
        </div>
      )
      i++
      continue
    }

    // ---- Ordered list ----
    const numMatch = line.match(/^\s*(\d+)\.\s(.+)/)
    if (numMatch) {
      elements.push(
        <div
          key={`ol-${i}`}
          style={{
            paddingLeft: 16,
            position: 'relative',
            margin: '2px 0',
            lineHeight: 1.7
          }}
        >
          <span style={{ position: 'absolute', left: 0, color: '#5c5c6a', fontSize: fontSize }}>{numMatch[1]}.</span>
          {renderInline(numMatch[2])}
        </div>
      )
      i++
      continue
    }

    // ---- Empty line ----
    if (line.trim() === '') {
      elements.push(<div key={`sp-${i}`} style={{ height: 4 }} />)
      i++
      continue
    }

    // ---- Regular paragraph ----
    elements.push(
      <p key={`p-${i}`} style={{ margin: '2px 0', lineHeight: 1.7 }}>
        {renderInline(line)}
      </p>
    )
    i++
  }

  return <>{elements}</>
}

export default MarkdownRenderer
