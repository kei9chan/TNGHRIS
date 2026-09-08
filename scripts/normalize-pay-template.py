"""Normalize artifact-tool OOXML for ExcelJS; preserve values and styling."""
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
path = Path(sys.argv[1])
with ZipFile(path) as archive:
    entries = [(entry, archive.read(entry.filename)) for entry in archive.infolist()]
with ZipFile(path, 'w', ZIP_DEFLATED) as archive:
    for entry, data in entries:
        if entry.filename.endswith('.xml'):
            text = data.decode('utf-8')
            text = text.replace('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace('<x:', '<').replace('</x:', '</')
            if entry.filename in ('xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'):
                text = text.replace('<sheetView showGridLines="1" workbookViewId="0" />', '<sheetView showGridLines="1" workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView>')
            data = text.encode('utf-8')
        archive.writestr(entry, data)
