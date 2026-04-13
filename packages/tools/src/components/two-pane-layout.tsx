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
    <div className="flex h-full w-full min-h-0 bg-slate-900">
      {/* Left Pane */}
      <div className="flex-1 border-r border-slate-700 bg-slate-800 overflow-hidden flex flex-col min-h-0" style={{ width: leftWidth }}>
        {left}
      </div>

      {/* Right Pane */}
      <div className="flex-1 bg-slate-800 overflow-hidden flex flex-col min-h-0" style={{ width: rightWidth }}>
        {right}
      </div>
    </div>
  )
}
