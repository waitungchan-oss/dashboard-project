#!/usr/bin/env python3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import socket
import sys
import webbrowser


ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8080
HOST = "127.0.0.1"


class DashboardHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def find_port(start_port):
    for port in range(start_port, start_port + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((HOST, port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"No available port found from {start_port} to {start_port + 99}.")


def main():
    requested_port = int(os.environ.get("DASHBOARD_PORT", DEFAULT_PORT))
    port = find_port(requested_port)
    url = f"http://{HOST}:{port}/index.html"
    handler = partial(DashboardHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((HOST, port), handler)

    print("")
    print("Dashboard server is running.")
    print(f"Project folder: {ROOT}")
    print(f"Open URL: {url}")
    print("Press Ctrl+C in this window to stop the server.")
    print("")

    try:
        if os.environ.get("DASHBOARD_NO_BROWSER") != "1":
            webbrowser.open(url)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping dashboard server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Unable to start dashboard server: {error}", file=sys.stderr)
        sys.exit(1)
