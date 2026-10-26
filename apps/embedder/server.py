"""Tiny embedding service for Plane semantic search.

POST /embed {"texts": [...], "query": false} -> {"vectors": [[...], ...]}
"query": true applies the model's search-query instruction (use it for the user's search text).
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastembed import TextEmbedding

MODEL = "BAAI/bge-small-en-v1.5"  # 384 dims, ~70 MB, CPU only
model = TextEmbedding(MODEL)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._send(200, {"model": MODEL})  # health check

    def do_POST(self):
        if self.path != "/embed":
            return self._send(404, {"error": "not found"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            texts = [str(t) for t in body["texts"]]
        except (ValueError, KeyError, TypeError):
            return self._send(400, {"error": 'expected {"texts": [...]}'})
        embed = model.query_embed if body.get("query") else model.embed
        self._send(200, {"vectors": [v.tolist() for v in embed(texts)]})

    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
