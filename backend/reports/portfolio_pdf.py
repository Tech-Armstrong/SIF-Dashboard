"""Portfolio builder PDF report using ReportLab with a dynamic grid layout."""

from __future__ import annotations

import io
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from reportlab.graphics import renderPDF
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.widgets.markers import makeMarker
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

CHART_COLORS = [
    "#2a78d6",
    "#1baf7a",
    "#eda100",
    "#008300",
    "#4a3aa7",
    "#e34948",
    "#e87ba4",
    "#eb6834",
]

# Aligned with frontend PortfolioBuilder MARKET_INDEX_COLORS
MARKET_INDEX_COLORS = {
    "NIFTY 50": "#e34948",
    "NIFTY 100": "#eda100",
    "NIFTY 500": "#008300",
    "NIFTY MIDCAP 150": "#4a3aa7",
    "NIFTY SMLCAP 250": "#eb6834",
}

PORTFOLIO_LINE_COLOR = "#2a78d6"

RETURN_PERIODS = ("1M", "3M", "6M", "1Y")
HIDDEN_FACT_KEYS = frozenset(
    {"Plans", "Options", "AUM", "Fund Size (AUM)", "NAV (Reg)"}
)

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 16 * mm
PAGE_BORDER_INSET = 10 * mm
CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN_X)
GRID_GAP = 14
CHART_LEGEND_GAP = 12
LEGEND_COL_RATIO = 0.42
CARD_PAD_X = 20  # card LEFTPADDING + RIGHTPADDING (10 + 10)
CARD_RADIUS = 8
MAX_GRID_COLS = 2
VAR_COLOR_RE = re.compile(r"^var\(\s*(--[\w-]+)\s*\)$")

_COLOR_TOKENS: dict[str, str] | None = None


def _load_color_tokens() -> dict[str, str]:
    global _COLOR_TOKENS
    if _COLOR_TOKENS is not None:
        return _COLOR_TOKENS

    tokens: dict[str, str] = {}
    data_path = Path(__file__).resolve().parent.parent.parent / "data" / "funds.json"
    try:
        with data_path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
        raw_tokens = payload.get("meta", {}).get("colorTokens", {})
        if isinstance(raw_tokens, dict):
            tokens = {str(key): str(value) for key, value in raw_tokens.items()}
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        tokens = {}

    _COLOR_TOKENS = tokens
    return tokens

INK = colors.HexColor("#1a1d21")
INK_SOFT = colors.HexColor("#4a5560")
MUTED = colors.HexColor("#6c757a")
LINE = colors.HexColor("#ddd6c8")
PAPER = colors.HexColor("#faf8f4")
CARD = colors.HexColor("#ffffff")
WASH = colors.HexColor("#f4f1ea")
ACCENT = colors.HexColor("#1f6b4a")
POS = colors.HexColor("#1f7a4d")
NEG = colors.HexColor("#b5341f")
PAGE_BORDER = colors.black
BOX_PAD_X = 20
INNER_WIDTH = CONTENT_WIDTH - BOX_PAD_X
PAGE_DISCLAIMER = (
    "*Disclaimer: Investments in Specialised Investment Funds (SIFs) are not "
    "obligations of or guaranteed by us, and are subject to investment risks. "
    "The data and analysis shared in this document are offered as part of our "
    "research service offerings. This is not an explicit recommendation for any "
    "SIF transactions. Our analysis is not intended to serve as a substitute for "
    "professional investment advice."
)


def portfolio_pdf_filename(client_name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", client_name.strip())
    slug = re.sub(r"\s+", "-", slug).lower() or "portfolio"
    return f"{slug}-portfolio-{date.today().isoformat()}.pdf"


def _sanitize_text(text: str) -> str:
    """Helvetica cannot render ₹ — normalise currency and HTML entities for PDF."""
    cleaned = str(text or "")
    cleaned = cleaned.replace("₹", "Rs. ")
    cleaned = cleaned.replace("&nbsp;", " ")
    cleaned = cleaned.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def resolve_peer_tables(
    selected_funds: list[dict[str, Any]],
    funds_index: list[dict[str, Any]],
    categories: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Filter category peer-research tables to the funds in the portfolio.

    Returns a list of category blocks:
      [{ categoryTitle, sections: [{ title, cols, rows }] }]
    Columns are kept when section col accent matches a selected fund's accent
    (same rule as the fund Peer Comparison UI).
    """
    from search import find_fund

    category_by_id = {str(c.get("id")): c for c in categories if c.get("id")}

    # Preserve portfolio order when grouping by category.
    category_order: list[str] = []
    accents_by_category: dict[str, set[str]] = {}

    for selected in selected_funds:
        fund_id = str(selected.get("fund_id") or selected.get("fundId") or "")
        if not fund_id:
            continue
        index_entry = find_fund(funds_index, fund_id)
        if index_entry is None:
            continue
        category_id = str(index_entry.get("categoryId") or "")
        accent = str(index_entry.get("accent") or "")
        if not category_id or not accent:
            continue
        if category_id not in accents_by_category:
            accents_by_category[category_id] = set()
            category_order.append(category_id)
        accents_by_category[category_id].add(accent)

    blocks: list[dict[str, Any]] = []
    for category_id in category_order:
        category = category_by_id.get(category_id)
        if not category:
            continue

        wanted_accents = accents_by_category[category_id]
        filtered_sections: list[dict[str, Any]] = []

        for section in category.get("sections") or []:
            if not isinstance(section, dict) or section.get("type") != "table":
                continue

            cols = section.get("cols") or []
            if not isinstance(cols, list) or not cols:
                continue

            kept_idx = [
                i
                for i, col in enumerate(cols)
                if isinstance(col, (list, tuple))
                and len(col) >= 3
                and str(col[2]) in wanted_accents
            ]
            if not kept_idx:
                continue

            filtered_cols = [
                [str(cols[i][0]), str(cols[i][1]), str(cols[i][2])] for i in kept_idx
            ]

            filtered_rows: list[list[str]] = []
            for row in section.get("rows") or []:
                if not isinstance(row, list) or not row:
                    continue
                label = _sanitize_text(str(row[0]))
                cells = [
                    _sanitize_text(str(row[i + 1]))
                    if i + 1 < len(row) and row[i + 1]
                    else "—"
                    for i in kept_idx
                ]
                filtered_rows.append([label, *cells])

            if not filtered_rows:
                continue

            filtered_sections.append(
                {
                    "title": str(section.get("title") or "Comparison"),
                    "cols": filtered_cols,
                    "rows": filtered_rows,
                }
            )

        if filtered_sections:
            blocks.append(
                {
                    "categoryTitle": str(
                        category.get("title") or category.get("chip") or category_id
                    ),
                    "sections": filtered_sections,
                }
            )

    return blocks


def _grid_columns(item_count: int, max_facts: int) -> int:
    if item_count <= 1:
        return 1
    if item_count == 2:
        return 2
    # Three funds fit best as 2+1 on A4; three columns are too narrow for facts text.
    if item_count == 3:
        return 2
    if max_facts >= 5:
        return 2
    return min(MAX_GRID_COLS, 2)


def _chunk_rows(items: list[Any], columns: int) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for index in range(0, len(items), columns):
        rows.append(items[index : index + columns])
    return rows


def _grid_table_row(
    cells: list[Any],
    col_width: float,
    gap_width: float,
) -> tuple[list[Any], list[float]]:
    """Build one grid row with gap spacers between cells."""
    row: list[Any] = []
    widths: list[float] = []
    for index, cell in enumerate(cells):
        if index > 0:
            row.append("")
            widths.append(gap_width)
        row.append(cell)
        widths.append(col_width)
    return row, widths


def _fmt_currency(value: float) -> str:
    return f"Rs. {value:,.2f}"


def _fmt_pct(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:,.2f}%"


def _fmt_alloc_pct(value: float) -> str:
    return f"{value:,.2f}"


def _fmt_date_label(date_str: str) -> str:
    try:
        parsed = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return parsed.strftime("%d %b %y")
    except ValueError:
        return _sanitize_text(date_str)


def _rebase_index_on_dates(
    points: list[dict[str, Any]],
    portfolio_dates: list[str],
    base: float,
) -> dict[str, float | None]:
    """Forward-fill closes onto portfolio dates; rebase to `base` at first close."""
    if not points or not portfolio_dates:
        return {}

    by_date: dict[str, float] = {}
    for point in points:
        date_key = str(point.get("date") or "")[:10]
        try:
            close = float(point.get("close"))
        except (TypeError, ValueError):
            continue
        if date_key:
            by_date[date_key] = close

    last_close: float | None = None
    base_close: float | None = None
    out: dict[str, float | None] = {}
    for date_key in portfolio_dates:
        exact = by_date.get(date_key[:10])
        if exact is not None:
            last_close = exact
        if last_close is None:
            out[date_key] = None
            continue
        if base_close is None or base_close == 0:
            base_close = last_close
        out[date_key] = (last_close / base_close) * base
    return out


def _truncate_label(text: str, max_len: int = 34) -> str:
    text = _sanitize_text(text)
    if len(text) <= max_len:
        return text
    return f"{text[: max_len - 3]}..."


def _safe_hex_color(value: str | None, fallback: str = "#2a78d6") -> HexColor:
    if not value:
        return HexColor(fallback)
    cleaned = value.strip().lower()
    if cleaned in {"transparent", "none", "inherit"}:
        return HexColor(fallback)

    var_match = VAR_COLOR_RE.match(cleaned)
    if var_match:
        token_hex = _load_color_tokens().get(var_match.group(1))
        if token_hex:
            cleaned = token_hex.strip().lower()

    if cleaned.startswith("#") and len(cleaned) in {4, 7}:
        return HexColor(cleaned)

    rgb_match = re.match(
        r"^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})",
        cleaned,
    )
    if rgb_match:
        r, g, b = (int(rgb_match.group(i)) / 255 for i in range(1, 4))
        return colors.Color(r, g, b)

    return HexColor(fallback)


def _visible_facts(fund: dict[str, Any]) -> list[list[str]]:
    rows: list[list[str]] = []
    for item in fund.get("facts") or []:
        if not isinstance(item, list) or len(item) < 2:
            continue
        key = str(item[0])
        if key in HIDDEN_FACT_KEYS:
            continue
        rows.append([key, _sanitize_text(str(item[1]))])
    return rows


def _return_color(value: float | None) -> colors.Color:
    if value is None:
        return INK
    if value > 0:
        return POS
    if value < 0:
        return NEG
    return INK


class DrawingFlowable(Flowable):
    def __init__(self, drawing: Drawing, width: float, height: float) -> None:
        super().__init__()
        self.drawing = drawing
        self.width = width
        self.height = height

    def wrap(self, availWidth: float, availHeight: float) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        renderPDF.draw(self.drawing, self.canv, 0, 0)


class RoundedCardFlowable(Flowable):
    """Fund snapshot card with rounded corners; accent stripe comes from inner table."""

    def __init__(
        self,
        inner: Table,
        width: float,
        radius: float = CARD_RADIUS,
    ) -> None:
        super().__init__()
        self.inner = inner
        self.width = width
        self.radius = radius
        self._height = 0.0

    def wrap(self, availWidth: float, availHeight: float) -> tuple[float, float]:
        inner_width = min(self.width, availWidth)
        _, height = self.inner.wrap(inner_width, availHeight)
        self._height = height
        return self.width, height

    def draw(self) -> None:
        canvas = self.canv
        width = self.width
        height = self._height
        radius = self.radius

        canvas.saveState()
        clip_path = canvas.beginPath()
        clip_path.roundRect(0, 0, width, height, radius)
        canvas.clipPath(clip_path, stroke=0, fill=0)

        canvas.setFillColor(CARD)
        canvas.roundRect(0, 0, width, height, radius, stroke=0, fill=1)
        self.inner.drawOn(canvas, 0, 0)
        canvas.restoreState()

        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.75)
        canvas.roundRect(0, 0, width, height, radius, stroke=1, fill=0)


class PortfolioReportPdf:
    """Build a portfolio PDF that mirrors the on-screen preview grid."""

    def __init__(
        self,
        payload: dict[str, Any],
        *,
        peer_tables: list[dict[str, Any]] | None = None,
    ) -> None:
        self.payload = payload
        self.peer_tables = peer_tables or []
        self.styles = getSampleStyleSheet()
        self.title_style = ParagraphStyle(
            "ReportTitle",
            parent=self.styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            spaceAfter=2,
            textColor=INK,
        )
        self.subtitle_style = ParagraphStyle(
            "ReportSubtitle",
            parent=self.styles["Normal"],
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            spaceAfter=10,
        )
        self.section_style = ParagraphStyle(
            "SectionTitle",
            parent=self.styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            spaceBefore=4,
            spaceAfter=8,
            textColor=INK,
        )
        self.body_style = ParagraphStyle(
            "Body",
            parent=self.styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=INK_SOFT,
        )
        self.card_amc_style = ParagraphStyle(
            "CardAmc",
            parent=self.body_style,
            fontSize=6.5,
            leading=8,
            textColor=MUTED,
            spaceAfter=3,
            wordWrap="LTR",
        )
        self.card_name_style = ParagraphStyle(
            "CardName",
            parent=self.body_style,
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=INK,
            spaceAfter=5,
            wordWrap="LTR",
        )
        self.card_chip_style = ParagraphStyle(
            "CardChip",
            parent=self.body_style,
            fontSize=7,
            leading=9,
            textColor=INK_SOFT,
            backColor=WASH,
            borderPadding=3,
            spaceAfter=6,
            wordWrap="LTR",
        )
        self.fact_key_style = ParagraphStyle(
            "FactKey",
            parent=self.body_style,
            fontSize=7,
            leading=9,
            textColor=MUTED,
            wordWrap="LTR",
        )
        self.fact_value_style = ParagraphStyle(
            "FactValue",
            parent=self.body_style,
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=9,
            textColor=INK,
            wordWrap="LTR",
            splitLongWords=1,
        )
        self.panel_title_style = ParagraphStyle(
            "PanelTitle",
            parent=self.body_style,
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=INK,
            spaceAfter=4,
        )
        self.meta_style = ParagraphStyle(
            "Meta",
            parent=self.body_style,
            fontSize=8,
            leading=11,
            textColor=MUTED,
            spaceAfter=6,
        )

    def _boxed_panel(
        self,
        rows: list[list[Any]],
        background: colors.Color = PAPER,
    ) -> Table:
        panel = Table(rows, colWidths=[CONTENT_WIDTH])
        panel.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), background),
                    ("BOX", (0, 0), (-1, -1), 0.75, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), BOX_PAD_X / 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), BOX_PAD_X / 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        return panel

    def _draw_page_border(self, canvas: Any) -> None:
        canvas.saveState()
        canvas.setStrokeColor(PAGE_BORDER)
        canvas.setLineWidth(1)
        inset = PAGE_BORDER_INSET
        canvas.rect(
            inset,
            inset,
            PAGE_WIDTH - (2 * inset),
            PAGE_HEIGHT - (2 * inset),
            stroke=1,
            fill=0,
        )
        canvas.restoreState()

    def _on_page(self, canvas: Any, doc: Any) -> None:
        self._draw_page_border(canvas)
        style = ParagraphStyle(
            "PageDisclaimer",
            fontName="Helvetica",
            fontSize=5.5,
            leading=7,
            textColor=MUTED,
            alignment=1,  # centre
        )
        paragraph = Paragraph(_sanitize_text(PAGE_DISCLAIMER), style)
        paragraph.wrap(CONTENT_WIDTH, 28 * mm)
        paragraph.drawOn(
            canvas,
            MARGIN_X,
            PAGE_BORDER_INSET + 2.5 * mm,
        )

    def build(self) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=14 * mm,
            bottomMargin=24 * mm,
            title="Portfolio Report",
        )

        story: list[Any] = []
        story.extend(self._build_header())
        story.extend(self._build_fund_card_grid())
        story.append(Spacer(1, 10))
        story.extend(self._build_returns_panel())
        story.append(PageBreak())
        story.extend(self._build_visuals_page())
        peer_story = self._build_peer_comparison_pages()
        if peer_story:
            story.append(PageBreak())
            story.extend(peer_story)

        doc.build(story, onFirstPage=self._on_page, onLaterPages=self._on_page)
        return buffer.getvalue()

    def _build_visuals_page(self) -> list[Any]:
        """Page 2: NAV line chart, then stacked allocation donuts with right legends."""
        story: list[Any] = []
        line_panel = self._build_line_chart_panel()
        if line_panel:
            story.extend(line_panel)
            story.append(Spacer(1, 12))
        story.extend(self._build_stacked_allocation_charts())
        return story

    def _build_header(self) -> list[Any]:
        client = _sanitize_text(self.payload.get("client_name", "")) or "Client"
        total = float(self.payload.get("total_amount") or 0)
        funds = self.payload.get("funds") or []

        meta_line = (
            f"<b>Client:</b> {client} &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"<b>Portfolio:</b> {_fmt_currency(total)} &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"<b>Funds:</b> {len(funds)}"
        )

        return [
            Paragraph("Portfolio Report", self.title_style),
            Paragraph(
                "Allocation snapshot, charts, and trailing returns",
                self.subtitle_style,
            ),
            Paragraph(meta_line, self.body_style),
            Spacer(1, 4),
            Table(
                [[""]],
                colWidths=[CONTENT_WIDTH],
                rowHeights=[1],
                style=TableStyle([("LINEABOVE", (0, 0), (-1, -1), 1, LINE)]),
            ),
            Spacer(1, 10),
        ]

    def _facts_table(self, facts: list[list[str]], width: float) -> Table | str:
        if not facts:
            return ""

        rows = [
            [
                Paragraph(_sanitize_text(key), self.fact_key_style),
                Paragraph(value or "—", self.fact_value_style),
            ]
            for key, value in facts
        ]
        inner_width = width - CARD_PAD_X
        table = Table(rows, colWidths=[inner_width * 0.36, inner_width * 0.64])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE, 0.8, (1, 2)),
                ]
            )
        )
        return table

    def _fund_card(self, fund: dict[str, Any], width: float) -> RoundedCardFlowable:
        accent = _safe_hex_color(fund.get("accent_color") or fund.get("accentColor"))
        amount = float(fund.get("amount") or 0)
        percent = float(fund.get("percent") or 0)
        facts = _visible_facts(fund)

        content_rows: list[list[Any]] = [
            [Paragraph(_sanitize_text(str(fund.get("amc", ""))).upper(), self.card_amc_style)],
            [Paragraph(_sanitize_text(str(fund.get("name", ""))), self.card_name_style)],
            [Paragraph(_sanitize_text(str(fund.get("category", ""))), self.card_chip_style)],
        ]

        facts_table = self._facts_table(facts, width)
        if facts_table:
            content_rows.append([facts_table])

        inner_width = width - CARD_PAD_X
        alloc_bar = Table(
            [
                [
                    Paragraph(
                        f"<b>{_fmt_currency(amount)}</b>",
                        ParagraphStyle(
                            "AllocAmt",
                            parent=self.body_style,
                            fontSize=8.5,
                            textColor=INK,
                            wordWrap="LTR",
                        ),
                    ),
                    Paragraph(
                        f"<b>{_fmt_pct(percent)}</b>",
                        ParagraphStyle(
                            "AllocPct",
                            parent=self.body_style,
                            fontSize=8.5,
                            textColor=ACCENT,
                            alignment=2,
                            wordWrap="LTR",
                        ),
                    ),
                ]
            ],
            colWidths=[inner_width * 0.58, inner_width * 0.42],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), WASH),
                    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            ),
        )
        content_rows.append([Spacer(1, 4)])
        content_rows.append([alloc_bar])

        card = Table(content_rows, colWidths=[width])
        card.setStyle(
            TableStyle(
                [
                    ("LINEABOVE", (0, 0), (-1, 0), 3, accent),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, 0), 8),
                    ("TOPPADDING", (0, 1), (-1, -3), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -3), 2),
                    ("TOPPADDING", (0, -2), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
                ]
            )
        )
        return RoundedCardFlowable(card, width)

    def _build_fund_card_grid(self) -> list[Any]:
        funds: list[dict[str, Any]] = self.payload.get("funds") or []
        if not funds:
            return []

        max_facts = max((len(_visible_facts(fund)) for fund in funds), default=0)
        columns = _grid_columns(len(funds), max_facts)
        gaps_in_row = max(columns - 1, 0)
        col_width = (CONTENT_WIDTH - (GRID_GAP * gaps_in_row)) / columns

        grid_rows: list[list[Any]] = []
        grid_col_widths: list[float] | None = None

        for row_funds in _chunk_rows(funds, columns):
            cells = [self._fund_card(fund, col_width) for fund in row_funds]
            while len(cells) < columns:
                cells.append("")
            row, widths = _grid_table_row(cells, col_width, GRID_GAP)
            grid_rows.append(row)
            grid_col_widths = widths

        grid = Table(
            grid_rows,
            colWidths=grid_col_widths or [col_width],
            hAlign="LEFT",
        )
        grid.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), GRID_GAP),
                ]
            )
        )

        return [
            Paragraph("Selected funds snapshot", self.section_style),
            grid,
        ]

    def _legend_swatch(self, color_hex: str) -> Table:
        swatch = Table([[""]], colWidths=[8], rowHeights=[8])
        swatch.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), HexColor(color_hex)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        return swatch

    def _donut_chart_box(
        self,
        slices: list[tuple[str, float, str]],
    ) -> Table:
        legend_style = ParagraphStyle(
            "Legend",
            parent=self.body_style,
            fontSize=7,
            leading=9,
            textColor=INK,
            wordWrap="LTR",
            splitLongWords=1,
        )

        legend_width = INNER_WIDTH * LEGEND_COL_RATIO
        chart_width = INNER_WIDTH - legend_width - CHART_LEGEND_GAP
        chart_height = 108
        legend_rows: list[list[Any]] = []
        slice_total = sum(value for _, value, _ in slices)

        drawing = Drawing(chart_width, chart_height)
        if not slices:
            drawing.add(
                String(
                    12,
                    chart_height / 2,
                    "No allocation data",
                    fontName="Helvetica",
                    fontSize=8,
                    fillColor=MUTED,
                )
            )
        else:
            pie_size = min(92, chart_height - 16)
            pie = Pie()
            pie.x = 10
            pie.y = (chart_height - pie_size) / 2
            pie.width = pie_size
            pie.height = pie_size
            pie.data = [value for _, value, _ in slices]
            pie.labels = None
            pie.slices.strokeWidth = 0.5
            pie.slices.strokeColor = colors.white
            pie.innerRadiusFraction = 0.55

            for index, (_, _, color_hex) in enumerate(slices):
                pie.slices[index].fillColor = HexColor(color_hex)

            drawing.add(pie)

            for label, value, color_hex in slices:
                pct = (value / slice_total * 100) if slice_total > 0 else 0
                legend_rows.append(
                    [
                        self._legend_swatch(color_hex),
                        Paragraph(
                            f"{_sanitize_text(label)} "
                            f"<font color='#6c757a'>({_fmt_pct(pct)})</font>",
                            legend_style,
                        ),
                    ]
                )

        legend_table: Any = Paragraph("No allocation data", self.meta_style)
        if legend_rows:
            legend_table = Table(
                legend_rows,
                colWidths=[10, legend_width - 14],
                style=TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                ),
            )

        chart_legend_row = Table(
            [
                [
                    DrawingFlowable(drawing, chart_width, chart_height),
                    legend_table,
                ]
            ],
            colWidths=[chart_width, legend_width],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )

        panel_rows: list[list[Any]] = [[chart_legend_row]]

        return self._boxed_panel(panel_rows)

    def _build_stacked_allocation_charts(self) -> list[Any]:
        funds: list[dict[str, Any]] = self.payload.get("funds") or []

        fund_slices: list[tuple[str, float, str]] = []
        for index, fund in enumerate(funds):
            amount = float(fund.get("amount") or 0)
            if amount <= 0:
                continue
            fund_slices.append(
                (
                    str(fund.get("name", "")),
                    amount,
                    CHART_COLORS[index % len(CHART_COLORS)],
                )
            )

        category_totals: dict[str, float] = {}
        for fund in funds:
            amount = float(fund.get("amount") or 0)
            if amount <= 0:
                continue
            category = str(fund.get("category") or "Other")
            category_totals[category] = category_totals.get(category, 0) + amount

        category_slices = [
            (
                category,
                amount,
                CHART_COLORS[(index + 1) % len(CHART_COLORS)],
            )
            for index, (category, amount) in enumerate(category_totals.items())
        ]

        fund_panel = self._donut_chart_box(fund_slices)
        category_panel = self._donut_chart_box(category_slices)

        return [
            Paragraph("Portfolio Allocated Fund Breakdown", self.section_style),
            fund_panel,
            Spacer(1, 14),
            Paragraph("Portfolio Category Breakdown", self.section_style),
            category_panel,
        ]

    def _build_line_chart_panel(self) -> list[Any]:
        series = self.payload.get("portfolio_series") or {}
        points: list[dict[str, Any]] = series.get("points") or []
        if not points:
            return []

        portfolio_base = float(self.payload.get("portfolio_base") or 100)
        base_date = _fmt_date_label(str(series.get("base_date") or "-"))
        current_value = float(series.get("current_value") or 0)
        total_return = series.get("total_return_pct")
        excluded = int(series.get("excluded_fund_count") or 0)
        market_indexes: list[dict[str, Any]] = self.payload.get("market_indexes") or []

        max_points = 60
        step = max(1, len(points) // max_points)
        sampled = points[::step]
        if sampled[-1] != points[-1]:
            sampled.append(points[-1])

        sampled_dates = [str(point.get("date") or "") for point in sampled]
        full_dates = [str(point.get("date") or "") for point in points]

        portfolio_plot = [
            (index, float(point.get("index") or 0) * portfolio_base)
            for index, point in enumerate(sampled)
        ]
        plot_series: list[list[tuple[int, float]]] = [portfolio_plot]
        line_meta: list[tuple[str, str]] = [("Portfolio", PORTFOLIO_LINE_COLOR)]

        for index_payload in market_indexes:
            raw_points = index_payload.get("points") or []
            if not raw_points:
                continue
            rebased = _rebase_index_on_dates(raw_points, full_dates, portfolio_base)
            index_plot: list[tuple[int, float]] = []
            for sample_index, date_key in enumerate(sampled_dates):
                value = rebased.get(date_key)
                if value is None:
                    continue
                index_plot.append((sample_index, float(value)))
            if len(index_plot) < 2:
                continue
            symbol = str(index_payload.get("symbol") or "")
            label = str(index_payload.get("label") or symbol or "Index")
            color_hex = (
                index_payload.get("color")
                or MARKET_INDEX_COLORS.get(symbol)
                or CHART_COLORS[len(line_meta) % len(CHART_COLORS)]
            )
            plot_series.append(index_plot)
            line_meta.append((label, str(color_hex)))

        chart_width = INNER_WIDTH - 16
        chart_height = 155
        drawing = Drawing(chart_width, chart_height)

        plot = LinePlot()
        plot.x = 34
        plot.y = 16
        plot.width = chart_width - 46
        plot.height = chart_height - 32
        plot.data = plot_series

        for series_index, (_label, color_hex) in enumerate(line_meta):
            plot.lines[series_index].strokeColor = _safe_hex_color(
                color_hex, PORTFOLIO_LINE_COLOR
            )
            plot.lines[series_index].strokeWidth = 2 if series_index == 0 else 1.5
            plot.lines[series_index].symbol = makeMarker("FilledCircle", size=0)

        if len(sampled) > 1:
            plot.xValueAxis.valueMin = 0
            plot.xValueAxis.valueMax = len(sampled) - 1

            def _x_label(value: float) -> str:
                index = int(round(value))
                index = max(0, min(index, len(sampled) - 1))
                return _fmt_date_label(str(sampled[index].get("date", "")))

            plot.xValueAxis.labelTextFormat = _x_label

        plot.yValueAxis.labels.fontName = "Helvetica"
        plot.yValueAxis.labels.fontSize = 7
        plot.xValueAxis.labels.fontName = "Helvetica"
        plot.xValueAxis.labels.fontSize = 6
        plot.xValueAxis.labels.angle = 20
        drawing.add(plot)

        meta = (
            f"From <b>{base_date}</b> · Current Portfolio Value "
            f"<b>{_fmt_currency(current_value)}</b> · Return "
            f"<b>{_fmt_pct(total_return if total_return is not None else None)}</b>"
        )

        box_rows: list[list[Any]] = [
            [Paragraph(meta, self.meta_style)],
            [DrawingFlowable(drawing, chart_width, chart_height)],
        ]

        if len(line_meta) > 1:
            legend_bits = []
            for label, color_hex in line_meta:
                safe_label = _sanitize_text(label)
                legend_bits.append(
                    f'<font color="{color_hex}">●</font> {safe_label}'
                )
            box_rows.append(
                [
                    Paragraph(
                        " · ".join(legend_bits),
                        self.meta_style,
                    )
                ]
            )

        if excluded > 0:
            box_rows.append(
                [
                    Paragraph(
                        f"{excluded} fund(s) excluded — no NAV history available.",
                        self.meta_style,
                    )
                ]
            )

        return [
            Paragraph("Portfolio Growth", self.section_style),
            self._boxed_panel(box_rows),
        ]

    def _build_returns_panel(self) -> list[Any]:
        funds: list[dict[str, Any]] = self.payload.get("funds") or []
        if not funds:
            return []

        fund_name_style = ParagraphStyle(
            "RetFundName",
            parent=self.fact_value_style,
            fontSize=7.5,
            leading=9,
            wordWrap="LTR",
            splitLongWords=1,
        )
        category_style = ParagraphStyle(
            "RetCategory",
            parent=self.fact_key_style,
            fontSize=7,
            leading=8.5,
            textColor=MUTED,
            wordWrap="LTR",
            splitLongWords=1,
        )
        amount_style = ParagraphStyle(
            "RetAmount",
            parent=self.fact_value_style,
            fontSize=7.2,
            leading=9,
            alignment=2,
        )
        pct_style = ParagraphStyle(
            "RetPct",
            parent=self.fact_value_style,
            fontSize=7.2,
            leading=9,
            alignment=2,
        )

        header = ["Fund", "Category", "Allocated", "Alloc %", *RETURN_PERIODS]
        body_rows: list[list[Any]] = []
        for fund in funds:
            returns: dict[str, Any] = fund.get("returns") or {}
            row: list[Any] = [
                Paragraph(_sanitize_text(str(fund.get("name", ""))), fund_name_style),
                Paragraph(_sanitize_text(str(fund.get("category", ""))), category_style),
                Paragraph(_fmt_currency(float(fund.get("amount") or 0)), amount_style),
                Paragraph(_fmt_alloc_pct(float(fund.get("percent") or 0)), pct_style),
            ]
            for period in RETURN_PERIODS:
                value = returns.get(period)
                row.append(
                    Paragraph(
                        _fmt_pct(value if value is not None else None),
                        ParagraphStyle(
                            f"Ret_{period}",
                            parent=self.fact_value_style,
                            fontSize=7.2,
                            leading=9,
                            textColor=_return_color(
                                float(value) if value is not None else None
                            ),
                            alignment=1,
                        ),
                    )
                )
            body_rows.append(row)

        header_style = ParagraphStyle(
            "RetHead",
            parent=self.fact_key_style,
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9,
            textColor=INK,
        )
        header_center_style = ParagraphStyle(
            "RetHeadCenter",
            parent=header_style,
            alignment=1,
        )
        table_rows: list[list[Any]] = [
            [
                Paragraph(header[0], header_style),
                Paragraph(header[1], header_style),
                Paragraph(header[2], header_center_style),
                Paragraph(header[3], header_center_style),
                *[Paragraph(cell, header_center_style) for cell in header[4:]],
            ],
            *body_rows,
        ]

        col_widths = [
            INNER_WIDTH * 0.28,
            INNER_WIDTH * 0.15,
            INNER_WIDTH * 0.12,
            INNER_WIDTH * 0.07,
            INNER_WIDTH * 0.095,
            INNER_WIDTH * 0.095,
            INNER_WIDTH * 0.095,
            INNER_WIDTH * 0.095,
        ]
        table = Table(table_rows, colWidths=col_widths, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), WASH),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.2),
                    ("BOX", (0, 0), (-1, -1), 0.75, LINE),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("ALIGN", (0, 0), (1, -1), "LEFT"),
                    ("ALIGN", (2, 0), (3, 0), "CENTER"),
                    ("ALIGN", (2, 1), (3, -1), "RIGHT"),
                    ("ALIGN", (4, 0), (-1, -1), "CENTER"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )

        return [
            Paragraph("Fund returns", self.section_style),
            self._boxed_panel([[table]], background=CARD),
        ]

    def _build_peer_comparison_pages(self) -> list[Any]:
        """Peer research tables after visuals — filtered to portfolio funds.

        Each section title + table is a KeepTogether unit. Units pack into the
        remaining page space; if the next unit does not fit, the whole unit
        moves to the following page (no orphaned headings, no near-empty pages).
        """
        if not self.peer_tables:
            return []

        label_style = ParagraphStyle(
            "PeerLabel",
            parent=self.fact_key_style,
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=9,
            textColor=INK,
            wordWrap="LTR",
        )
        cell_style = ParagraphStyle(
            "PeerCell",
            parent=self.fact_value_style,
            fontSize=7,
            leading=9,
            wordWrap="LTR",
            splitLongWords=1,
        )
        col_short_style = ParagraphStyle(
            "PeerColShort",
            parent=self.fact_key_style,
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9,
            textColor=INK,
            alignment=1,
        )
        page_title_style = ParagraphStyle(
            "PeerPageTitle",
            parent=self.section_style,
            spaceBefore=0,
            spaceAfter=4,
            keepWithNext=True,
        )
        page_intro_style = ParagraphStyle(
            "PeerPageIntro",
            parent=self.subtitle_style,
            spaceAfter=8,
            keepWithNext=True,
        )
        subsection_style = ParagraphStyle(
            "PeerSectionTitle",
            parent=self.section_style,
            fontSize=11,
            leading=14,
            spaceBefore=8,
            spaceAfter=6,
            keepWithNext=True,
        )
        category_style = ParagraphStyle(
            "PeerCategoryTitle",
            parent=self.section_style,
            fontSize=13,
            leading=16,
            spaceBefore=10,
            spaceAfter=4,
            keepWithNext=True,
        )

        # Build individual section units first, then pack: first unit carries
        # the page title so it never sits alone on a page.
        units: list[Any] = []
        for block_idx, block in enumerate(self.peer_tables):
            sections = [
                section
                for section in (block.get("sections") or [])
                if (section.get("cols") or []) and (section.get("rows") or [])
            ]
            if not sections:
                continue

            for section_idx, section in enumerate(sections):
                cols = section.get("cols") or []
                rows = section.get("rows") or []

                fund_count = len(cols)
                label_w = INNER_WIDTH * (0.28 if fund_count <= 2 else 0.22)
                fund_w = (INNER_WIDTH - label_w) / max(fund_count, 1)
                col_widths = [label_w, *[fund_w] * fund_count]

                header_cells: list[Any] = [Paragraph("", label_style)]
                for col in cols:
                    short = _sanitize_text(str(col[0] if len(col) > 0 else ""))
                    amc = _sanitize_text(str(col[1] if len(col) > 1 else ""))
                    header_cells.append(
                        Paragraph(
                            f"{short}<br/><font size='6.5' color='#6c757a'>{amc}</font>",
                            col_short_style,
                        )
                    )

                table_rows: list[list[Any]] = [header_cells]
                for row in rows:
                    label = _sanitize_text(str(row[0] if row else ""))
                    cells = row[1:] if len(row) > 1 else []
                    table_row: list[Any] = [Paragraph(label, label_style)]
                    for ci in range(fund_count):
                        value = cells[ci] if ci < len(cells) else "—"
                        table_row.append(
                            Paragraph(_sanitize_text(str(value)) or "—", cell_style)
                        )
                    table_rows.append(table_row)

                table = Table(table_rows, colWidths=col_widths, repeatRows=1)
                style_cmds: list[Any] = [
                    ("BACKGROUND", (0, 0), (-1, 0), WASH),
                    ("BOX", (0, 0), (-1, -1), 0.75, LINE),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
                for ci, col in enumerate(cols, start=1):
                    accent = _safe_hex_color(
                        str(col[2]) if len(col) > 2 else None,
                        fallback="#1f6b4a",
                    )
                    style_cmds.append(("LINEABOVE", (ci, 0), (ci, 0), 2, accent))

                table.setStyle(TableStyle(style_cmds))

                piece: list[Any] = []
                if section_idx == 0:
                    if block_idx > 0:
                        piece.append(Spacer(1, 10))
                    piece.append(
                        Paragraph(
                            _sanitize_text(str(block.get("categoryTitle") or "Category")),
                            category_style,
                        )
                    )

                piece.extend(
                    [
                        Paragraph(
                            _sanitize_text(str(section.get("title") or "Comparison")),
                            subsection_style,
                        ),
                        self._boxed_panel([[table]], background=CARD),
                        Spacer(1, 6),
                    ]
                )
                units.append(piece)

        if not units:
            return []

        # Pack title into the first unit so a heading never sits alone when the
        # first table needs a fresh page. Later units stay independent so the
        # frame can fit as many complete tables as space allows.
        first = [
            Paragraph("Peer research comparison", page_title_style),
            Paragraph(
                "Side-by-side peer research for funds in this portfolio, "
                "grouped by category.",
                page_intro_style,
            ),
            *units[0],
        ]
        return [KeepTogether(first), *[KeepTogether(u) for u in units[1:]]]
