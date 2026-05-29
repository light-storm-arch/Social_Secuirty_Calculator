import React, { useState, useCallback } from 'react'

function valueToColor(value, min, max) {
  if (max === min) return '#3b82f6'
  const t = (value - min) / (max - min)
  // Green (low) -> Yellow (mid) -> Red (high) inverted: we want higher = better = warmer
  // Use blue -> cyan -> green -> yellow -> red (sequential, blue=low, red=high)
  let r, g, b
  if (t < 0.25) {
    const s = t / 0.25
    r = Math.round(59 + s * (0 - 59))
    g = Math.round(130 + s * (160 - 130))
    b = Math.round(246 + s * (246 - 246))
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25
    r = Math.round(0 + s * (34 - 0))
    g = Math.round(160 + s * (197 - 160))
    b = Math.round(246 + s * (94 - 246))
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25
    r = Math.round(34 + s * (245 - 34))
    g = Math.round(197 + s * (158 - 197))
    b = Math.round(94 + s * (11 - 94))
  } else {
    const s = (t - 0.75) / 0.25
    r = Math.round(245 + s * (239 - 245))
    g = Math.round(158 + s * (68 - 158))
    b = Math.round(11 + s * (68 - 11))
  }
  return `rgb(${r},${g},${b})`
}

export default function SensitivityHeatmap({ data, xLabel, yLabel, xValues, yValues, optimalX, optimalY }) {
  const [tooltip, setTooltip] = useState(null)

  if (!data || data.length === 0 || !xValues || !yValues) {
    return <div className="loading-text">No heatmap data available.</div>
  }

  const values = data.map(d => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)

  const cellW = Math.max(12, Math.min(40, Math.floor(600 / xValues.length)))
  const cellH = Math.max(12, Math.min(28, Math.floor(400 / yValues.length)))
  const paddingLeft = 60
  const paddingTop = 20
  const paddingBottom = 40
  const paddingRight = 20

  const svgWidth = paddingLeft + xValues.length * cellW + paddingRight
  const svgHeight = paddingTop + yValues.length * cellH + paddingBottom

  // Build lookup map
  const lookup = new Map()
  for (const d of data) {
    lookup.set(`${d.xVal},${d.yVal}`, d.value)
  }

  const handleMouseMove = useCallback((e, xVal, yVal, value) => {
    setTooltip({ x: e.clientX + 12, y: e.clientY - 24, xVal, yVal, value })
  }, [])
  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className="heatmap-container">
      <svg width={svgWidth} height={svgHeight} style={{ fontFamily: 'inherit' }}>
        {/* Y axis label */}
        <text
          x={14}
          y={paddingTop + yValues.length * cellH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 14, ${paddingTop + yValues.length * cellH / 2})`}
          fontSize={11}
          fill="#4b5a7a"
        >
          {yLabel}
        </text>

        {/* Y axis ticks (show every Nth) */}
        {yValues.map((yv, yi) => {
          const step = Math.ceil(yValues.length / 10)
          if (yi % step !== 0) return null
          return (
            <text
              key={yi}
              x={paddingLeft - 4}
              y={paddingTop + yi * cellH + cellH / 2 + 4}
              textAnchor="end"
              fontSize={9}
              fill="#4b5a7a"
            >
              {yv}
            </text>
          )
        })}

        {/* X axis ticks */}
        {xValues.map((xv, xi) => {
          const step = Math.ceil(xValues.length / 12)
          if (xi % step !== 0) return null
          return (
            <text
              key={xi}
              x={paddingLeft + xi * cellW + cellW / 2}
              y={paddingTop + yValues.length * cellH + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#4b5a7a"
            >
              {xv}
            </text>
          )
        })}

        {/* X axis label */}
        <text
          x={paddingLeft + xValues.length * cellW / 2}
          y={svgHeight - 4}
          textAnchor="middle"
          fontSize={11}
          fill="#4b5a7a"
        >
          {xLabel}
        </text>

        {/* Cells */}
        {yValues.map((yv, yi) =>
          xValues.map((xv, xi) => {
            const value = lookup.get(`${xv},${yv}`)
            if (value === undefined) return null
            const fill = valueToColor(value, minVal, maxVal)
            const isOptimal = xv === optimalX && yv === optimalY
            return (
              <rect
                key={`${xi}-${yi}`}
                x={paddingLeft + xi * cellW}
                y={paddingTop + yi * cellH}
                width={cellW}
                height={cellH}
                fill={fill}
                stroke={isOptimal ? 'white' : 'none'}
                strokeWidth={isOptimal ? 2 : 0}
                onMouseMove={e => handleMouseMove(e, xv, yv, value)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'crosshair' }}
              />
            )
          })
        )}

        {/* Optimal marker */}
        {optimalX !== undefined && optimalY !== undefined && (() => {
          const xi = xValues.indexOf(optimalX)
          const yi = yValues.indexOf(optimalY)
          if (xi < 0 || yi < 0) return null
          const cx = paddingLeft + xi * cellW + cellW / 2
          const cy = paddingTop + yi * cellH + cellH / 2
          return (
            <g>
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={Math.min(cellH - 2, 10)} fill="white" fontWeight="bold">
                ★
              </text>
            </g>
          )
        })()}
      </svg>

      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div>{xLabel}: <strong>{tooltip.xVal}</strong></div>
          <div>{yLabel}: <strong>{tooltip.yVal}</strong></div>
          <div>Value: <strong>${Math.round(tooltip.value).toLocaleString()}</strong></div>
        </div>
      )}

      {/* Color scale legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.78rem', color: '#4b5a7a' }}>
        <span>Low</span>
        <svg width={120} height={12}>
          <defs>
            <linearGradient id="heatLegend" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={valueToColor(minVal, minVal, maxVal)} />
              <stop offset="50%" stopColor={valueToColor((minVal + maxVal) / 2, minVal, maxVal)} />
              <stop offset="100%" stopColor={valueToColor(maxVal, minVal, maxVal)} />
            </linearGradient>
          </defs>
          <rect width={120} height={12} fill="url(#heatLegend)" rx={4} />
        </svg>
        <span>High</span>
      </div>
    </div>
  )
}
