"""Serve the repo locally and optionally save playtest evidence to a named directory."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import base64, json, os, re, sys
ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(sys.argv[2]).resolve() if len(sys.argv)>2 else ROOT/'v2'/'tests'/'evidence'
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def do_POST(self):
        url=urlparse(self.path)
        name=parse_qs(url.query).get('name',[''])[0]
        if url.path!='/__evidence' or not re.fullmatch(r'[a-zA-Z0-9_-]+\.(png|json)',name):
            self.send_error(400);return
        size=int(self.headers.get('Content-Length','0'))
        if size>16000000:self.send_error(413);return
        payload=self.rfile.read(size)
        try:
            if name.endswith('.png'):payload=base64.b64decode(payload.decode().split(',',1)[1],validate=True)
            else:json.loads(payload)
            EVIDENCE.mkdir(parents=True,exist_ok=True)
            (EVIDENCE/name).write_bytes(payload)
            self.send_response(200);self.end_headers();self.wfile.write(b'saved')
        except Exception:self.send_error(400)
    def log_message(self,*args):pass
os.chdir(ROOT)
ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1]) if len(sys.argv)>1 else 8125),Handler).serve_forever()
