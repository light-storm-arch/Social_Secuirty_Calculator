import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

export async function exportPdf({ title, inputs, headers, rows, chartRef }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.text(title, 14, 18)

  doc.setFontSize(10)
  let y = 26
  for (const [label, value] of Object.entries(inputs)) {
    doc.text(`${label}: ${value}`, 14, y)
    y += 6
  }

  if (chartRef?.current) {
    const canvas = await html2canvas(chartRef.current, { scale: 2 })
    const imgData = canvas.toDataURL('image/png')
    doc.addImage(imgData, 'PNG', 14, y + 4, 180, 80)
    y += 90
  }

  if (rows.length > 0) {
    doc.addPage()
    autoTable(doc, { head: [headers], body: rows, startY: 14 })
  }

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`)
}
