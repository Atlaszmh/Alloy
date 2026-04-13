import React, { useState, useRef } from 'react'

interface TwoPaneLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  initialLeftWidth?: number // percentage, 0-100
}

export const TwoPaneLayout: React.FC<TwoPaneLayoutProps> = ({
  left,
  right,
  initialLeftWidth = 50,
}) => {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const handleMouseDown = () => {
    isDraggingRef.current = true
  }

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return

      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100

      // Constrain to reasonable sizes (20% to 80%)
      if (newLeftWidth >= 20 && newLeftWidth <= 80) {
        setLeftWidth(newLeftWidth)
      }
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const rightWidth = 100 - leftWidth

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        backgroundColor: '#0f172a',
      }}
    >
      {/* Left Pane */}
      <div
        style={{
          width: `${leftWidth}%`,
          backgroundColor: '#1e293b',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: '1px solid #475569',
        }}
      >
        {left}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          backgroundColor: '#334155',
          cursor: 'col-resize',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = '#475569'
        }}
        onMouseLeave={(e) => {
          if (!isDraggingRef.current) {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = '#334155'
          }
        }}
      />

      {/* Right Pane */}
      <div
        style={{
          width: `${rightWidth}%`,
          backgroundColor: '#1e293b',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {right}
      </div>
    </div>
  )
}
