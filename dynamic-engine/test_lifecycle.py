import threading
import time
import unittest
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from server import CursorLifetime, cursor_process_running, watch_cursor


class LifecycleTests(unittest.TestCase):
    def test_stays_running_while_any_cursor_process_exists(self):
        life = CursorLifetime(0)
        self.assertFalse(life.should_exit(True, 1))
        self.assertFalse(life.should_exit(True, 1000))

    def test_exits_after_last_cursor_process_and_grace(self):
        life = CursorLifetime(0)
        life.should_exit(True, 1)
        self.assertFalse(life.should_exit(False, 2))
        self.assertFalse(life.should_exit(False, 9))
        self.assertTrue(life.should_exit(False, 10))

    def test_quick_restart_cancels_pending_shutdown(self):
        life = CursorLifetime(0)
        life.should_exit(True, 1)
        life.should_exit(False, 2)
        self.assertFalse(life.should_exit(True, 5))
        self.assertFalse(life.should_exit(False, 11))
        self.assertTrue(life.should_exit(False, 19))

    def test_install_without_open_cursor_does_not_leave_service_forever(self):
        life = CursorLifetime(0)
        self.assertFalse(life.should_exit(False, 29))
        self.assertTrue(life.should_exit(False, 30))

    def test_enumeration_failure_does_not_terminate_service(self):
        life = CursorLifetime(0)
        life.should_exit(True, 1)
        life.should_exit(False, 2)
        self.assertFalse(life.should_exit(None, 100))
        self.assertFalse(life.should_exit(False, 101))

    def test_watch_thread_shutdowns_only_translation_server(self):
        class Server:
            def __init__(self):
                self.closed = threading.Event()

            def shutdown(self):
                self.closed.set()

        server = Server()
        stopped = threading.Event()
        life = CursorLifetime(time.monotonic(), startup_grace=0)
        watcher = threading.Thread(target=watch_cursor, args=(server, stopped),
                                   kwargs={"interval": 0.01, "running_check": lambda: False, "lifetime": life})
        watcher.start()
        self.assertTrue(server.closed.wait(1))
        watcher.join(1)
        self.assertFalse(watcher.is_alive())

    def test_native_detection_returns_boolean_or_unknown(self):
        result = cursor_process_running()
        if os.name == 'nt':
            self.assertIsInstance(result, bool)
        else:
            self.assertIsNone(result)

    def test_real_http_listener_stops_after_monitor_requests_exit(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), BaseHTTPRequestHandler)
        stopped = threading.Event()
        life = CursorLifetime(time.monotonic(), startup_grace=0)
        watcher = threading.Thread(target=watch_cursor, args=(server, stopped),
                                   kwargs={"interval": 0.01, "running_check": lambda: False, "lifetime": life})
        watcher.start()
        server.serve_forever(poll_interval=0.01)
        server.server_close()
        watcher.join(1)
        self.assertFalse(watcher.is_alive())
        self.assertEqual(server.socket.fileno(), -1)


if __name__ == '__main__':
    unittest.main()
