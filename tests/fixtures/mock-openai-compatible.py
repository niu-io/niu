#!/usr/bin/env python3
"""Deterministic, local-only OpenAI-compatible chat fixture for image smoke tests."""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
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


HTTPServer(("0.0.0.0", int(os.environ.get("MOCK_PROVIDER_PORT", "24678"))), Handler).serve_forever()
