"""Browser/PWA shell smoke tests."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import config

config.CALENDAR_TOKEN = "web-test-token"
_tmp = tempfile.TemporaryDirectory()
config.CALENDAR_DB = str(Path(_tmp.name) / "calendar.db")
config.PAGES_DIR = Path(_tmp.name) / "pages"

from app import app  # noqa: E402  (config must be set before app import)


class WebShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        _tmp.cleanup()

    def test_home_serves_pwa(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("雾灯手帐", response.text)
        self.assertIn("/manifest.webmanifest", response.text)

    def test_static_assets_are_web_content(self):
        js = self.client.get("/app.js")
        self.assertEqual(js.status_code, 200)
        self.assertIn("javascript", js.headers["content-type"])
        manifest = self.client.get("/manifest.webmanifest")
        self.assertEqual(manifest.status_code, 200)
        self.assertIn("application/manifest+json", manifest.headers["content-type"])

    def test_api_routes_win_before_static_mount(self):
        ping = self.client.get("/api/v1/calendar/ping")
        self.assertEqual(ping.status_code, 200)
        self.assertEqual(ping.json()["service"], "calendar")

    def test_private_api_stays_protected(self):
        denied = self.client.get("/api/v1/calendar/events")
        self.assertEqual(denied.status_code, 401)
        allowed = self.client.get(
            "/api/v1/calendar/events",
            headers={"X-Calendar-Token": "web-test-token"},
        )
        self.assertEqual(allowed.status_code, 200)


if __name__ == "__main__":
    unittest.main()
