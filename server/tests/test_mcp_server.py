"""MCP tool surface smoke tests."""

from __future__ import annotations

import unittest

import mcp_server


class McpToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_page_view_tool_is_advertised(self):
        result = await mcp_server.on_list_tools(None, None)
        self.assertEqual(
            [tool.name for tool in result.tools],
            ["calendar", "view_handbook_page"],
        )

    def test_page_image_is_converted_to_sdk_content(self):
        blocks = mcp_server._to_blocks([
            {"type": "text", "text": "page"},
            {"type": "image", "data": "YWJj", "mimeType": "image/png"},
        ])
        self.assertEqual([block.type for block in blocks], ["text", "image"])
        self.assertEqual(blocks[1].mime_type, "image/png")


if __name__ == "__main__":
    unittest.main()
