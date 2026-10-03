"""Server-side fallback renderer for a handbook day page.

The phone normally uploads the exact page it rendered.  Some mobile WebViews cannot
turn the DOM into a PNG reliably, so MCP viewing also has a deterministic server-side
fallback.  It deliberately accepts already-formatted lines to stay independent from
the calendar database layer.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1080
MARGIN = 78
_BUNDLED_FONT = Path(__file__).with_name("assets") / "LXGWWenKai-Regular.ttf"
_SOURCE_FONT = (Path(__file__).parent.parent / "ios" / "Resources" / "Fonts" /
                "LXGWWenKai-Regular.ttf")
FONT_PATH = _BUNDLED_FONT if _BUNDLED_FONT.is_file() else _SOURCE_FONT


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size=size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont,
          max_width: int) -> list[str]:
    """Wrap Latin and CJK text without requiring spaces between words."""
    text = str(text or "").strip()
    if not text:
        return [""]
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if current and draw.textlength(candidate, font=font) > max_width:
            lines.append(current.rstrip())
            current = char.lstrip()
        else:
            current = candidate
    if current or not lines:
        lines.append(current.rstrip())
    return lines


def _card_height(draw: ImageDraw.ImageDraw, lines: Iterable[str],
                 font: ImageFont.ImageFont, max_width: int,
                 line_height: int) -> tuple[list[str], int]:
    wrapped: list[str] = []
    for line in lines:
        wrapped.extend(_wrap(draw, line, font, max_width))
    return wrapped, 42 + max(1, len(wrapped)) * line_height


def render_handbook_page_png(day: str, weekday: str,
                             event_lines: list[str],
                             note_lines: list[str]) -> bytes:
    """Render one day into a compact PNG suitable for an MCP image block."""
    title_font = _font(58)
    date_font = _font(34)
    section_font = _font(31)
    body_font = _font(29)
    small_font = _font(22)

    # A tiny measurement canvas lets us determine the final height first.
    measure = ImageDraw.Draw(Image.new("RGB", (WIDTH, 32), "white"))
    card_width = WIDTH - 2 * MARGIN
    text_width = card_width - 64
    event_wrapped, event_height = _card_height(
        measure, event_lines or ["今天没有日程"], body_font, text_width, 48)
    note_cards: list[tuple[list[str], int]] = []
    if note_lines:
        for line in note_lines[:12]:
            note_cards.append(_card_height(measure, [line], body_font,
                                           text_width, 48))
    else:
        note_cards.append(_card_height(measure, ["今天还没有贴便签"], body_font,
                                       text_width, 48))

    height = 326 + event_height + sum(h + 22 for _, h in note_cards) + 150
    height = max(920, min(height, 2800))
    image = Image.new("RGB", (WIDTH, height), "#fbf5eb")
    draw = ImageDraw.Draw(image)

    # Soft paper-like bands and a wine-red binding line.
    draw.rectangle((0, 0, WIDTH, 210), fill="#efe1d5")
    draw.rectangle((0, 0, 20, height), fill="#76243e")
    draw.text((MARGIN, 58), "雾灯手帐", font=title_font, fill="#70213a")
    draw.text((MARGIN, 137), f"{day}  周{weekday}", font=date_font, fill="#5f5150")
    draw.line((MARGIN, 204, WIDTH - MARGIN, 204), fill="#c49a88", width=3)

    y = 248
    draw.text((MARGIN, y), "日程", font=section_font, fill="#70213a")
    y += 52
    draw.rounded_rectangle((MARGIN, y, WIDTH - MARGIN, y + event_height),
                           radius=26, fill="#fffdf8", outline="#dac3b5", width=2)
    line_y = y + 25
    for line in event_wrapped:
        draw.text((MARGIN + 32, line_y), line, font=body_font, fill="#332c2c")
        line_y += 48
    y += event_height + 42

    draw.text((MARGIN, y), "便签", font=section_font, fill="#70213a")
    y += 54
    colors = ("#fff0b8", "#f6d9df", "#e3eef0")
    for index, (wrapped, card_height) in enumerate(note_cards):
        if y + card_height > height - 90:
            draw.text((MARGIN + 24, height - 72), "还有更多内容，请结合随图文字查看",
                      font=small_font, fill="#776765")
            break
        draw.rounded_rectangle((MARGIN, y, WIDTH - MARGIN, y + card_height),
                               radius=22, fill=colors[index % len(colors)])
        line_y = y + 24
        for line in wrapped:
            draw.text((MARGIN + 32, line_y), line, font=body_font, fill="#332c2c")
            line_y += 48
        y += card_height + 22

    draw.text((MARGIN, height - 58), "由雾灯手帐根据当前内容生成",
              font=small_font, fill="#9a7f79")
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()
