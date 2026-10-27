"""Loopback-only offline translation service. No request text is logged or sent online."""
import argparse
import functools
import hmac
import json
import os
import re
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")


def cursor_process_running():
    """Read process names without opening Cursor, inspecting chats or spawning a shell."""
    if os.name != "nt":
        return None
    import ctypes
    from ctypes import wintypes

    class ProcessEntry(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
    kernel.Process32FirstW.restype = wintypes.BOOL
    kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
    kernel.Process32NextW.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)  # TH32CS_SNAPPROCESS
    if snapshot == ctypes.c_void_p(-1).value:
        return None
    try:
        entry = ProcessEntry()
        entry.dwSize = ctypes.sizeof(entry)
        if not kernel.Process32FirstW(snapshot, ctypes.byref(entry)):
            return None
        while True:
            if entry.szExeFile.lower() == "cursor.exe":
                return True
            if not kernel.Process32NextW(snapshot, ctypes.byref(entry)):
                return False if ctypes.get_last_error() == 18 else None  # ERROR_NO_MORE_FILES
    finally:
        kernel.CloseHandle(snapshot)


class CursorLifetime:
    def __init__(self, start, startup_grace=30, exit_grace=8):
        self.start = start
        self.startup_grace = startup_grace
        self.exit_grace = exit_grace
        self.seen_cursor = False
        self.absent_since = None

    def should_exit(self, running, now):
        if running is None:
            self.absent_since = None  # An enumeration failure must not terminate a live service.
            return False
        if running:
            self.seen_cursor = True
            self.absent_since = None
            return False
        if not self.seen_cursor:
            return now - self.start >= self.startup_grace
        if self.absent_since is None:
            self.absent_since = now
        return now - self.absent_since >= self.exit_grace


def watch_cursor(server, stopped, interval=2, running_check=cursor_process_running, lifetime=None):
    lifetime = lifetime or CursorLifetime(time.monotonic())
    while not stopped.wait(interval):
        if lifetime.should_exit(running_check(), time.monotonic()):
            server.shutdown()
            return


def create_engine(model_dir):
    import ctranslate2
    import sentencepiece
    directory = Path(model_dir)
    translator = ctranslate2.Translator(str(directory / "model"), device="cpu", compute_type="int8", inter_threads=1, intra_threads=2)
    # SentencePiece's Windows file API can reject non-ASCII paths; loading bytes avoids that.
    tokenizer = sentencepiece.SentencePieceProcessor(model_proto=(directory / "sentencepiece.model").read_bytes())
    lock = threading.Lock()

    @functools.lru_cache(maxsize=3000)
    def translate(text):
        # Short paragraphs preserve markdown structure; code and URLs are excluded in the renderer.
        lines = text.split("\n")
        outputs = []
        for line in lines:
            if not line.strip() or not re.search(r"[A-Za-z]{2}", line) or re.search(r"[\u3400-\u9fff]", line):
                outputs.append(line)
                continue
            protected = r"(https?://\S+|\b(?:Cursor|GitHub|OpenAI|ChatGPT|MCP|VSIX)\b)"
            parts = re.split(protected, line)
            translated_parts = []
            for part in parts:
                if not part or re.fullmatch(protected, part) or not re.search(r"[A-Za-z]{2}", part):
                    translated_parts.append(part)
                    continue
                fragments = [fragment for fragment in re.split(r"(?<=[.!?])\s+", part) if fragment]
                tokens = []
                for fragment in fragments:
                    encoded = tokenizer.encode(fragment, out_type=str)
                    tokens.extend(encoded[start:start + 400] for start in range(0, len(encoded), 400))
                with lock:
                    results = translator.translate_batch(tokens, beam_size=2, max_decoding_length=512)
                translated_parts.append("".join(tokenizer.decode(result.hypotheses[0]).replace("\u2581", " ").strip() for result in results))
            outputs.append("".join(translated_parts))
        return "\n".join(outputs)
    return translate


def serve(config_file):
    config = json.loads(Path(config_file).read_text(encoding="utf-8-sig"))
    try:
        request = urllib.request.Request("http://127.0.0.1:" + str(config["port"]) + "/health", headers={"Authorization": "Bearer " + config["token"]})
        with urllib.request.urlopen(request, timeout=1) as response:
            if json.load(response).get("ready"):
                return
    except Exception:
        pass
    translate = create_engine(config["modelDirectory"])
    token = config["token"]
    allowed_origins = {"vscode-file://vscode-app", "null"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def origin_allowed(self):
            origin = self.headers.get("Origin")
            return not origin or origin in allowed_origins

        def respond(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            origin = self.headers.get("Origin")
            if origin in allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            return self.origin_allowed() and hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)

        def do_OPTIONS(self):
            self.respond(204 if self.origin_allowed() else 403, {})

        def do_GET(self):
            if not self.authorized():
                return self.respond(403, {"error": "unauthorized"})
            if self.path != "/health":
                return self.respond(404, {"error": "not_found"})
            self.respond(200, {"ready": True, "engine": "CTranslate2", "from": "en", "to": "zh", "pid": os.getpid(),
                               "version": "2.1.0", "engineId": config.get("engineId"),
                               "lifecycle": "cursor-process", "exitGraceSeconds": 8})

        def do_POST(self):
            if not self.authorized():
                return self.respond(403, {"error": "unauthorized"})
            if self.path != "/translate":
                return self.respond(404, {"error": "not_found"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if size <= 0 or size > 100_000:
                    return self.respond(413, {"error": "request_too_large"})
                data = json.loads(self.rfile.read(size))
                texts = data.get("texts")
                if not isinstance(texts, list) or not 1 <= len(texts) <= 12 or any(not isinstance(text, str) or len(text) > 4000 for text in texts):
                    return self.respond(400, {"error": "invalid_texts"})
                self.respond(200, {"translations": [translate(text) for text in texts]})
            except (ValueError, TypeError):
                self.respond(400, {"error": "invalid_json"})
            except Exception:
                self.respond(500, {"error": "translation_failed"})

    try:
        server = ThreadingHTTPServer(("127.0.0.1", config["port"]), Handler)
    except OSError:
        return  # Another instance already owns the configured port; never create a second listener.
    server.daemon_threads = True
    stopped = threading.Event()
    watcher = threading.Thread(target=watch_cursor, args=(server, stopped), daemon=True)
    watcher.start()
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        stopped.set()
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    arguments = parser.parse_args()
    serve(arguments.config)
