import React from 'react'

interface TwoPaneLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: string
  rightWidth?: string
}

export const TwoPaneLayout: React.FC<TwoPaneLayoutProps> = ({
  left,
  right,
  leftWidth = '50%',
  rightWidth = '50%',
}) => {
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0, backgroundColor: '#0f172a' }}>
      {/* Left Pane */}
      <div style={{ flex: 1, borderRight: '1px solid #475569', backgroundColor: '#1e293b', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, width: leftWidth }}>
        {left}
      </div>

      {/* Right Pane */}
      <div style={{ flex: 1, backgroundColor: '#1e293b', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, width: rightWidth }}>
        {right}
      </div>
    </div>
  )
}
