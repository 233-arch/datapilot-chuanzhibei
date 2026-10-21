from pathlib import Path
from html import escape
import re
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle, Preformatted, KeepTogether
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('CN', 'C:/Windows/Fonts/simsun.ttc', subfontIndex=0))
GREEN = colors.HexColor('#0d8069')
INK = colors.HexColor('#294438')
GRAY = colors.HexColor('#718274')
LINE = colors.HexColor('#e1e9de')
styles = {
    'body': ParagraphStyle('body',fontName='CN',fontSize=10,leading=17,textColor=INK,spaceAfter=9,wordWrap='CJK'),
    'h2': ParagraphStyle('h2',fontName='CN',fontSize=15,leading=23,textColor=GREEN,spaceBefore=17,spaceAfter=10,keepWithNext=True,wordWrap='CJK'),
    'h3': ParagraphStyle('h3',fontName='CN',fontSize=11,leading=18,textColor=GREEN,spaceBefore=9,spaceAfter=6,keepWithNext=True,wordWrap='CJK'),
    'cell': ParagraphStyle('cell',fontName='CN',fontSize=8.5,leading=14,textColor=INK,wordWrap='CJK'),
    'small': ParagraphStyle('small',fontName='CN',fontSize=8.3,leading=14,textColor=GRAY,wordWrap='CJK',spaceAfter=8),
    'title': ParagraphStyle('title',fontName='CN',fontSize=32,leading=44,textColor=INK,spaceAfter=10),
    'subtitle': ParagraphStyle('subtitle',fontName='CN',fontSize=16,leading=25,textColor=GREEN,spaceAfter=16),
    'code': ParagraphStyle('code',fontName='CN',fontSize=8,leading=12,textColor=GRAY,borderPadding=10),
}
def clean(text):
    text = text.replace('—','-').replace('–','-').replace('‑','-')
    return escape(re.sub(r'`([^`]+)`',r'\1',text))
def p(text,style='body'):
    return Paragraph(clean(text),styles[style])
def chrome(canvas,doc):
    canvas.saveState()
    width,height=A4
    canvas.setStrokeColor(LINE);canvas.line(48,height-39,width-48,height-39)
    canvas.setFont('CN',8);canvas.setFillColor(GRAY)
    canvas.drawString(48,height-28,'数问 DataPilot / 参赛作品技术说明')
    canvas.drawRightString(width-48,height-28,'v0.1  |  2026-10-22')
    canvas.line(48,41,width-48,41)
    canvas.drawString(48,27,'可运行初版 · 演示模式与真实模型模式明确区分')
    canvas.drawRightString(width-48,27,str(doc.page))
    canvas.restoreState()

target=OUT/'数问DataPilot_技术说明.pdf'
doc=SimpleDocTemplate(str(target),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=59,bottomMargin=57,title='数问 DataPilot 技术说明',author='DataPilot Project',allowSplitting=True)
story=[Spacer(1,21),p('数问 DataPilot','title'),p('让数据，回答问题。','subtitle'),p('AI WEB 网页开发挑战赛 · AI 数据分析与可视化方向','small'),Spacer(1,14)]
story.append(p('从一份 CSV 到一次可核验的探索：自然语言生成分析计划，确定性引擎计算统计结果，图表与报告提供来源和口径。'))
shot=ROOT/'docs/screenshots/desktop-workspace.png'
if shot.exists():
    from PIL import Image as PILImage
    w,h=PILImage.open(shot).size
    story.extend([Spacer(1,12),Image(str(shot),width=499,height=499*h/w),Spacer(1,7),p('图 1：桌面工作台实际运行界面。截图明确标示演示模式，统计数字来自合成样本实际计算。','small')])
story.extend([Spacer(1,12),p('交付范围','h3'),p('已实现上传、质量检查、清洗与撤销、可调图表、分析证据、历史与报告。尚需配置真实模型密钥并实测，录制演示视频并准备评审访问。','small'),PageBreak()])

lines=(ROOT/'docs/技术文档.md').read_text(encoding='utf-8').splitlines()
i=0
while i<len(lines):
    line=lines[i].strip()
    if not line or line.startswith('# ') or line.startswith('版本 v0.1'):
        i+=1;continue
    if line.startswith('```'):
        block=[];i+=1
        while i<len(lines) and not lines[i].startswith('```'):
            block.append(lines[i]);i+=1
        story.extend([Preformatted('\n'.join(block),styles['code']),Spacer(1,10)]);i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            current=lines[i].strip()
            if not re.match(r'^\|[\s|:\-]+\|$',current):
                rows.append([Paragraph(clean(c.strip()),styles['cell']) for c in current.strip('|').split('|')])
            i+=1
        widths=[87,206,206] if rows and len(rows[0])==3 else [499/len(rows[0])]*len(rows[0])
        table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eff5eb')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.4,LINE),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
        story.extend([table,Spacer(1,11)]);continue
    if line.startswith('## '):
        story.append(p(line[3:],'h2'));i+=1;continue
    if line.startswith('### '):
        story.append(p(line[4:],'h3'));i+=1;continue
    story.append(p(line));i+=1
doc.build(story,onFirstPage=chrome,onLaterPages=chrome)
reader=PdfReader(str(target))
assert len(reader.pages)<=30
text='\n'.join(page.extract_text() or '' for page in reader.pages)
assert '数问' in text and '模型' in text and len(text)>2000
print(f'Created {target}; pages={len(reader.pages)}; extracted_chars={len(text)}')
