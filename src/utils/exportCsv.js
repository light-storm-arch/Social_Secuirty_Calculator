export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
