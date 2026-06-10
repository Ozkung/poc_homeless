from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# Register Thai-compatible font (use Helvetica as fallback, Thai chars may not render)
# We'll use a system font that supports Thai
font_paths = [
    "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/thai/TlwgTypo.ttf",
]

thai_font = "Helvetica"
for fp in font_paths:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont("ThaiFont", fp))
            thai_font = "ThaiFont"
            break
        except Exception:
            pass

OUT = os.path.join(os.path.dirname(__file__), "roles_summary.pdf")
doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=2*cm, rightMargin=2*cm,
                        topMargin=2*cm, bottomMargin=2*cm)

W = A4[0] - 4*cm

styles = getSampleStyleSheet()
normal = ParagraphStyle("n", fontName=thai_font, fontSize=9, leading=13)
bold   = ParagraphStyle("b", fontName=thai_font, fontSize=9, leading=13, spaceAfter=2)
h1     = ParagraphStyle("h1", fontName=thai_font, fontSize=16, leading=20, spaceAfter=6, textColor=colors.HexColor("#1a365d"), fontWeight="bold")
h2     = ParagraphStyle("h2", fontName=thai_font, fontSize=12, leading=16, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#2b6cb0"), fontWeight="bold")
h3     = ParagraphStyle("h3", fontName=thai_font, fontSize=10, leading=14, spaceBefore=6, spaceAfter=3, textColor=colors.HexColor("#2d3748"), fontWeight="bold")
small  = ParagraphStyle("sm", fontName=thai_font, fontSize=8, leading=11, textColor=colors.HexColor("#4a5568"))

ROLE_COLOR = {
    "SUPER_ADMIN":       colors.HexColor("#553C9A"),
    "ADMIN":             colors.HexColor("#2B6CB0"),
    "CASE_MANAGER":      colors.HexColor("#276749"),
    "CARE_GIVER":        colors.HexColor("#C05621"),
    "MEDICAL_VOLUNTEER": colors.HexColor("#B7791F"),
}

ROLES = [
    {
        "name": "SUPER_ADMIN",
        "thai": "ผู้ดูแลระบบสูงสุด",
        "route_group": "(admin)/*",
        "pages": [
            ("/admin/dashboard", "แดชบอร์ด — สถิติภาพรวมระบบ"),
            ("/admin/zones",     "จัดการโซน (ดู / สร้าง / แก้ไข / ลบ)"),
            ("/admin/users",     "จัดการผู้ใช้งานทั้งหมดในองค์กร"),
            ("/admin/patients/[id]", "ดูข้อมูลผู้ป่วย"),
        ],
        "exclusive": [
            "สร้าง / แก้ไข / ปิดใช้งานผู้ใช้",
            "โอนย้าย CARE_GIVER ระหว่าง CASE_MANAGER",
            "สร้าง Inventory Item ใหม่",
            "สร้างและจัดการ Zone",
        ],
        "api_note": "เข้าถึง API ได้ทุก endpoint เท่ากับ ADMIN บวกสิทธิ์พิเศษข้างต้น",
    },
    {
        "name": "ADMIN",
        "thai": "ผู้ดูแลระบบองค์กร",
        "route_group": "(admin)/*",
        "pages": [
            ("/admin/dashboard", "แดชบอร์ด — สถิติภาพรวม"),
            ("/admin/zones",     "จัดการโซน"),
            ("/admin/users",     "ดูรายชื่อผู้ใช้"),
            ("/admin/patients/[id]", "ดูข้อมูลผู้ป่วย"),
        ],
        "exclusive": [
            "จัดการ Zone (สร้าง / แก้ไข / ลบ)",
            "จัดการ Form Template และ Event",
            "ดูและอนุมัติ Inventory adjustment",
            "CRUD ผู้ป่วยทั้งหมด",
        ],
        "api_note": "สิทธิ์เกือบเท่า SUPER_ADMIN ยกเว้นการจัดการผู้ใช้และการสร้าง Item",
    },
    {
        "name": "CASE_MANAGER",
        "thai": "ผู้จัดการกรณี",
        "route_group": "(cm)/*",
        "pages": [
            ("/cm/dashboard",         "แดชบอร์ด"),
            ("/cm/patients",          "รายชื่อผู้ป่วยที่รับผิดชอบ"),
            ("/cm/patients/new",      "สร้างผู้ป่วยใหม่"),
            ("/cm/patients/[id]",     "รายละเอียดผู้ป่วย"),
            ("/cm/events",            "แผนการเยี่ยม"),
            ("/cm/forms",             "แบบฟอร์มทั้งหมด"),
            ("/cm/forms/new",         "สร้างแบบฟอร์มใหม่"),
            ("/cm/forms/[id]",        "ดู / แก้ไขแบบฟอร์ม"),
            ("/cm/forms/[id]/builder","Form Builder"),
            ("/cm/inventory",         "ดู Inventory (อ่านอย่างเดียว + อนุมัติ)"),
            ("/cm/reports",           "รายงานประจำเดือน"),
            ("/cm/users",             "ทีมงาน CARE_GIVER ที่ดูแล"),
            ("/cm/profile",           "โปรไฟล์"),
        ],
        "exclusive": [
            "สร้างผู้ป่วยใหม่ (ผูก case manager อัตโนมัติ)",
            "สร้าง / แก้ไข / ลบ Form Template",
            "สร้าง / แก้ไข Event (แผนเยี่ยม)",
            "สร้าง CARE_GIVER ในทีมตัวเอง",
            "ดูรายงานประจำเดือน",
            "อนุมัติ Inventory adjustment",
        ],
        "api_note": "ดูผู้ป่วยได้ทุกคนในองค์กร, สร้างและอัปเดต Care Plan",
    },
    {
        "name": "CARE_GIVER",
        "thai": "ผู้ดูแลภาคสนาม",
        "route_group": "(fw)/*",
        "pages": [
            ("/fw/dashboard",    "แดชบอร์ด"),
            ("/fw/patients",     "ผู้ป่วยที่ได้รับมอบหมาย"),
            ("/fw/patients/[id]","รายละเอียดผู้ป่วย"),
            ("/fw/tasks",        "งานที่ได้รับมอบหมาย"),
            ("/fw/tasks/[id]",   "หน้า Submit งาน"),
        ],
        "exclusive": [
            "Check-in งาน",
            "Submit แบบฟอร์มงาน (Form Answers)",
            "บันทึก Note ในงาน",
            "อัปเดตสถานะงาน",
            "ส่ง SOS Alert",
        ],
        "api_note": "เห็นเฉพาะผู้ป่วยที่มีงานมอบหมายให้ตัวเอง (filtered by assigneeId)",
    },
    {
        "name": "MEDICAL_VOLUNTEER",
        "thai": "อาสาสมัครทางการแพทย์",
        "route_group": "(medvol)/*",
        "pages": [
            ("/medvol/dashboard", "แดชบอร์ด"),
            ("/medvol/inventory", "จัดการ Inventory"),
            ("/medvol/patients",  "รายชื่อผู้ป่วย (อ่านอย่างเดียว)"),
            ("/medvol/patients/[id]", "รายละเอียดผู้ป่วย"),
        ],
        "exclusive": [
            "Stock-in สินค้า",
            "Deduct สินค้า",
            "บันทึก Lot หมดอายุ",
            "ขอปรับ Inventory (adj-request)",
            "อนุมัติ adj-request",
            "ดูของใกล้หมดอายุ / ของเกือบหมด",
        ],
        "api_note": "ดูผู้ป่วยได้ทุกคน (read-only), จัดการ Inventory ได้เต็มที่ยกเว้นสร้าง Item ใหม่",
    },
]

story = []

# Title
story.append(Paragraph("Homeless Mobile Clinic by AUTRA", h1))
story.append(Paragraph("สรุปสิทธิ์การเข้าถึงตาม Role", h2))
story.append(Paragraph("สร้างอัตโนมัติจาก codebase  •  poc_homeless", small))
story.append(Spacer(1, 0.4*cm))
story.append(HRFlowable(width=W, thickness=1, color=colors.HexColor("#CBD5E0")))
story.append(Spacer(1, 0.4*cm))

# Overview table
overview_data = [
    [Paragraph("<b>Role</b>", bold), Paragraph("<b>ชื่อ</b>", bold),
     Paragraph("<b>Route Group</b>", bold), Paragraph("<b>จำนวนหน้า</b>", bold)],
]
for r in ROLES:
    overview_data.append([
        Paragraph(r["name"], normal),
        Paragraph(r["thai"], normal),
        Paragraph(r["route_group"], normal),
        Paragraph(str(len(r["pages"])), normal),
    ])

col_w = [W*0.28, W*0.28, W*0.26, W*0.18]
t = Table(overview_data, colWidths=col_w)
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2D3748")),
    ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
    ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#CBD5E0")),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFC"), colors.white]),
    ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING",(0,0), (-1,-1), 6),
    ("RIGHTPADDING",(0,0),(-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 4),
    ("BOTTOMPADDING",(0,0),(-1,-1),4),
]))
story.append(t)
story.append(Spacer(1, 0.6*cm))

# Detail per role
for r in ROLES:
    color = ROLE_COLOR[r["name"]]
    story.append(HRFlowable(width=W, thickness=2, color=color))
    story.append(Spacer(1, 0.15*cm))
    story.append(Paragraph(f'{r["name"]}  —  {r["thai"]}', h2))
    story.append(Paragraph(f'Route group: <b>{r["route_group"]}</b>', small))
    story.append(Spacer(1, 0.2*cm))

    # Pages table
    story.append(Paragraph("หน้าที่เข้าถึงได้", h3))
    page_data = [[Paragraph("<b>Path</b>", bold), Paragraph("<b>คำอธิบาย</b>", bold)]]
    for path, desc in r["pages"]:
        page_data.append([Paragraph(path, normal), Paragraph(desc, normal)])
    pt = Table(page_data, colWidths=[W*0.38, W*0.62])
    pt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), color),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#E2E8F0")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F7FAFC"), colors.white]),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",(0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING",(0,0),(-1,-1),3),
    ]))
    story.append(pt)
    story.append(Spacer(1, 0.25*cm))

    # Exclusive actions
    story.append(Paragraph("สิทธิ์พิเศษ / Actions เฉพาะ Role นี้", h3))
    for item in r["exclusive"]:
        story.append(Paragraph(f"• {item}", normal))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph(f"<i>API Note: {r['api_note']}</i>", small))
    story.append(Spacer(1, 0.5*cm))

# Public routes
story.append(HRFlowable(width=W, thickness=1, color=colors.HexColor("#CBD5E0")))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph("Public Routes (ไม่ต้อง Login)", h3))
for p, d in [("/login", "หน้า Login"), ("/setup", "ตั้งค่าระบบครั้งแรก"), ("/", "Redirect → /login")]:
    story.append(Paragraph(f"<b>{p}</b>  —  {d}", normal))

doc.build(story)
print(f"PDF saved: {OUT}")
