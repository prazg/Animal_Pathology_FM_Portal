"""Comprehensive mock verification exercising every runnable open-weight model × task combination."""
from __future__ import annotations

import os
import unittest

os.environ["PORTAL_MOCK"] = "1"

from fastapi.testclient import TestClient  # type: ignore
from backend.config import load_registry
from backend.server import app


class TestAnimalPathPortalMock(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)
        cls.registry = load_registry()

    def test_registry_schema_and_paper_links(self) -> None:
        models = self.registry["models"]
        self.assertGreaterEqual(len(models), 16)
        for m in models:
            self.assertTrue(m.get("id"))
            self.assertTrue(m.get("name"))
            self.assertTrue(len(m.get("papers") or []) >= 1, f"Missing paper link for {m['id']}")
            for p in m["papers"]:
                self.assertTrue(p["url"].startswith("https://"), f"Invalid paper URL on {m['id']}")

    def test_health_and_pna_header(self) -> None:
        r = self.client.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("Access-Control-Allow-Private-Network"), "true")
        body = r.json()
        self.assertTrue(body["mock"])

    def test_all_runnable_model_task_combinations(self) -> None:
        combos = 0
        for m in self.registry["models"]:
            if not m.get("runnable"):
                continue
            for task in m.get("tasks", []):
                combos += 1
                resp = self.client.post(
                    "/api/jobs",
                    data={
                        "model_id": m["id"],
                        "task": task,
                        "params": '{"k_clusters": 3}',
                    },
                )
                self.assertEqual(resp.status_code, 200, f"Failed POST /api/jobs for {m['id']} × {task}: {resp.text}")
                job = resp.json()
                self.assertEqual(job["status"], "completed", f"Job did not complete for {m['id']} × {task}: {job}")
                self.assertTrue(len(job.get("panels", [])) >= 1)
                self.assertTrue(len(job.get("table", [])) >= 1)
        self.assertGreaterEqual(combos, 20)


if __name__ == "__main__":
    unittest.main()
