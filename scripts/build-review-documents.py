"""Create current review DOCX files and editable repository documentation.

Run with the Codex bundled Python (python-docx). Render each DOCX with the
document skill renderer before delivery. No credentials or model calls used.
"""
from pathlib import Path
import json
import argparse
from datetime import datetime, timezone
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "docs/review-materials-v0.7.0.json").read_text(encoding="utf-8"))
OUT = ROOT / "outputs/v0.7.0/submission-documents"
OUT.mkdir(parents=True, exist_ok=True)
EDITABLE = {"product": "产品介绍.md", "technical": "技术文档.md", "speech": "演讲与录制方案.md"}
parser = argparse.ArgumentParser()
parser.add_argument("--only", choices=list(EDITABLE))
args = parser.parse_args()


def set_font(style, size, bold=False):
    style.font.name = "Microsoft YaHei"
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.color.rgb = RGBColor(0, 0, 0)
    style.font.underline = False
    style.font.italic = False
    pr = style.element.get_or_add_rPr()
    fonts = pr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        pr.insert(0, fonts)
    for name in ["ascii", "hAnsi", "eastAsia", "cs"]:
        fonts.set(qn("w:" + name), "Microsoft YaHei")
    for attr in list(fonts.attrib):
        if attr.endswith("Theme"):
            del fonts.attrib[attr]
    for color in pr.findall(qn("w:color")):
        for attr in list(color.attrib):
            if "theme" in attr.lower():
                del color.attrib[attr]
    pp = style.element.find(qn("w:pPr"))
    if pp is not None:
        for border in list(pp.findall(qn("w:pBdr"))):
            pp.remove(border)


def add_table(doc, headers, rows, widths):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    borders = OxmlElement("w:tblBorders")
    for edge in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        b = OxmlElement("w:" + edge)
        for key, val in [("val", "single"), ("sz", "5"), ("color", "D9D9D9")]:
            b.set(qn("w:" + key), val)
        borders.append(b)
    table._tbl.tblPr.append(borders)
    for col, width in zip(table.columns, widths):
        col.width = Cm(width)
    for cell, value in zip(table.rows[0].cells, headers):
        cell.text = value
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    for row in rows:
        for cell, value in zip(table.add_row().cells, row):
            cell.text = value
    for i, row in enumerate(table.rows):
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for j, cell in enumerate(row.cells):
            cell.width = Cm(widths[j])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            pr = cell._tc.get_or_add_tcPr()
            shade = OxmlElement("w:shd")
            shade.set(qn("w:fill"), "DEEBF7" if i == 0 else ("F5F7FA" if i % 2 == 0 else "FFFFFF"))
            pr.append(shade)
            margins = OxmlElement("w:tcMar")
            for edge, value in [("top", "85"), ("bottom", "85"), ("left", "110"), ("right", "110")]:
                node = OxmlElement("w:" + edge)
                node.set(qn("w:w"), value)
                node.set(qn("w:type"), "dxa")
                margins.append(node)
            pr.append(margins)
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = Pt(16)
                if j == 0:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    run.font.size = Pt(10.5)
                    run.font.bold = i == 0
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


for specification in DATA["documents"]:
    if args.only and args.only != specification["key"]:
        continue
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(1.7), Cm(1.7)
    sec.left_margin = sec.right_margin = Cm(2.1)
    sec.header_distance = sec.footer_distance = Cm(.7)
    for name, size, bold in [("Normal", 11.5, False), ("Title", 24, True), ("Subtitle", 10, False), ("Heading 1", 16, True), ("Caption", 9.5, False), ("Header", 9, False), ("Footer", 9, False)]:
        set_font(doc.styles[name], size, bold)
    normal = doc.styles["Normal"].paragraph_format
    normal.line_spacing = Pt(18)
    normal.space_after = Pt(8)
    normal.widow_control = True
    heading = doc.styles["Heading 1"].paragraph_format
    heading.space_before, heading.space_after = Pt(12), Pt(8)
    heading.line_spacing = Pt(23)
    heading.keep_with_next = True
    title = doc.styles["Title"].paragraph_format
    title.space_after, title.line_spacing = Pt(9), Pt(31)
    doc.styles["Caption"].paragraph_format.line_spacing = Pt(14)
    doc.styles["Caption"].paragraph_format.space_after = Pt(8)
    doc.core_properties.title = specification["title"]
    doc.core_properties.author = "疯狂星期四"
    doc.core_properties.subject = f"DataPilot v{DATA['version']} 本地作品材料"
    for key in ["created", "modified"]:
        setattr(doc.core_properties, key, datetime(2026, 11, 16, tzinfo=timezone.utc))
    sec.header.paragraphs[0].text = f"数问 DataPilot    v{DATA['version']}    {DATA['date']}"
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run("疯狂星期四    第 ")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    footer.add_run(" 页")
    doc.add_paragraph(specification["title"], "Title")
    doc.add_paragraph(DATA["team"], "Subtitle")
    doc.add_paragraph(DATA["members"], "Subtitle")
    markdown = ["# " + specification["title"], "", f"版本 v{DATA['version']} · {DATA['date']}", "", DATA["team"], DATA["members"], ""]
    for index, blocks in enumerate(specification["pages"]):
        if index:
            doc.add_page_break()
        for block in blocks:
            kind = block[0]
            if kind == "h":
                doc.add_heading(block[1], 1)
                markdown += ["## " + block[1], ""]
            elif kind == "p":
                doc.add_paragraph(block[1])
                markdown += [block[1], ""]
            elif kind == "image":
                path = ROOT / block[1]
                if not path.is_file():
                    raise FileNotFoundError(path)
                para = doc.add_paragraph()
                para.paragraph_format.keep_with_next = True
                para.paragraph_format.line_spacing = 1.0
                para.add_run().add_picture(str(path), width=Cm(16.8))
                doc.add_paragraph(block[2], "Caption")
                markdown += [f"![{block[2]}]({Path(block[1]).relative_to('docs').as_posix()})", ""]
            elif kind == "table":
                add_table(doc, *block[1:])
                markdown += ["| " + " | ".join(block[1]) + " |", "| " + " | ".join(["---"] * len(block[1])) + " |"]
                markdown += ["| " + " | ".join(row) + " |" for row in block[2]] + [""]
    destination = OUT / (specification["filename"] + ".docx")
    doc.save(destination)
    (ROOT / "docs" / EDITABLE[specification["key"]]).write_text("\n".join(markdown), encoding="utf-8")
    print(destination)
