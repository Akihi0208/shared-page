"""Server-rendered handbook page tests."""

from __future__ import annotations

import unittest

from PIL import Image

from page_renderer import render_handbook_page_png


class PageRendererTests(unittest.TestCase):
    def test_rendered_page_is_a_valid_png(self):
        data = render_handbook_page_png(
            "2026-10-03",
            "六",
            ["18:00–19:00 散步 · 惠惠"],
            ["沈雾 11:10: 今天也想你 ♥"],
        )
        self.assertTrue(data.startswith(b"\x89PNG\r\n\x1a\n"))
        image = Image.open(__import__("io").BytesIO(data))
        self.assertEqual(image.width, 1080)
        self.assertGreaterEqual(image.height, 920)

    def test_empty_day_also_renders(self):
        data = render_handbook_page_png("2026-10-04", "日", [], [])
        self.assertGreater(len(data), 1000)


if __name__ == "__main__":
    unittest.main()
