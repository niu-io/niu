#!/usr/bin/env python3
"""Deterministic local text/video upstream for packaged recovery tests."""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    video_jobs = {}
    video_creates = 0
    video_queries = 0
    video_requests = 0

    def authorized(self):
        return self.headers.get("Authorization") == f"Bearer {os.environ['PROVIDER_KEY']}"

    def send_json(self, value, status=200):
        response = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def video_get(self):
        if self.path != "/fixture/video-counts":
            type(self).video_requests += 1
        if not self.authorized():
            self.send_error(401)
            return
        if self.path == "/fixture/video-counts":
            self.send_json({"creates": type(self).video_creates, "queries": type(self).video_queries, "requests": type(self).video_requests})
            return
        job_id = self.path.removeprefix("/contents/generations/tasks/")
        job = type(self).video_jobs.get(job_id)
        if job is None:
            self.send_error(404)
            return
        type(self).video_queries += 1
        job["queries"] += 1
        status = "queued" if job["queries"] == 1 else "running" if job["queries"] == 2 else "succeeded"
        response = {"id": job_id, "model": "fixture-video-model", "status": status}
        if status == "succeeded":
            # Metadata fixture only: this reserved domain is never a downloadable asset.
            response["content"] = {"video_url": "https://video-fixture.invalid/result.mp4"}
            response["usage"] = {"completion_tokens": 100000}
        self.send_json(response)

    def video_post(self):
        type(self).video_requests += 1
        if not self.authorized():
            self.send_error(401)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 65536:
                raise ValueError("invalid body length")
            body = json.loads(self.rfile.read(size))
            content = body.get("content")
            if body.get("model") != "fixture-video-model" or not isinstance(content, list) or len(content) != 1:
                raise ValueError("unsupported fixture input")
            if content[0].get("type") != "text" or not isinstance(content[0].get("text"), str) or not content[0]["text"]:
                raise ValueError("unsupported fixture content")
        except (ValueError, TypeError, AttributeError):
            self.send_error(400)
            return
        type(self).video_creates += 1
        if content[0]['text'] == 'Package uncertain submission fixture':
            self.send_json({'error': {'message': 'Synthetic uncertain creation without a job identifier'}})
            return
        job_id = f"package-video-{type(self).video_creates}"
        type(self).video_jobs[job_id] = {"queries": 0}
        self.send_json({"id": job_id})

    def do_GET(self):
        if self.path == "/fixture/video-counts" or self.path.startswith("/contents/generations/tasks/"):
            self.video_get()
            return
        if self.path != "/v1/models":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != f"Bearer {os.environ['PROVIDER_KEY']}":
            self.send_error(401)
            return
        response = json.dumps(
            {"object": "list", "data": [{"id": "fixture-model", "object": "model"}]}
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def do_POST(self):
        if self.path == "/fixture/inspect-image":
            if not self.authorized():
                self.send_error(401)
                return
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            self.send_json({"schema_version": 2, "detector_revision": body["detector_revision"],
                            "content_sha256": body["content_sha256"], "verdict": "clear"})
            return
        if self.path == "/contents/generations/tasks":
            self.video_post()
            return
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != f"Bearer {os.environ['PROVIDER_KEY']}":
            self.send_error(401)
            return
        try:
            request = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        except (ValueError, json.JSONDecodeError):
            self.send_error(400)
            return
        if request.get("model") != "fixture-model" or not request.get("messages"):
            self.send_error(400)
            return

        if request.get("stream") is True:
            events = [
                {
                    "id": "chatcmpl-package-smoke-stream",
                    "object": "chat.completion.chunk",
                    "model": "fixture-model",
                    "choices": [{"index": 0, "delta": {"role": "assistant", "content": "stream "}, "finish_reason": None}],
                },
                {
                    "id": "chatcmpl-package-smoke-stream",
                    "object": "chat.completion.chunk",
                    "model": "fixture-model",
                    "choices": [{"index": 0, "delta": {"content": "fixture"}, "finish_reason": None}],
                },
                {
                    "id": "chatcmpl-package-smoke-stream",
                    "object": "chat.completion.chunk",
                    "model": "fixture-model",
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                },
                {
                    "id": "chatcmpl-package-smoke-stream",
                    "object": "chat.completion.chunk",
                    "model": "fixture-model",
                    "choices": [],
                    "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
                },
            ]
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            for event in events:
                self.wfile.write(f"data: {json.dumps(event, separators=(',', ':'))}\n\n".encode())
                self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            return

        response = json.dumps(
            {
                "id": "chatcmpl-package-smoke",
                "object": "chat.completion",
                "created": 1,
                "model": "fixture-model",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "fixture completion"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, _format, *_args):
        print(self.requestline, flush=True)


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", int(os.environ.get("MOCK_PROVIDER_PORT", "24678"))), Handler).serve_forever()
