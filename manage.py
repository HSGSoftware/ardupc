#!/usr/bin/env python3
"""
Django-benzeri "manage.py runserver" giriş noktası.

Bu proje Flask + SocketIO kullandığı için normalde `python app.py` ile çalışır.
Ancak bazı dış araçlar (ör. Termux dev manager) `python manage.py runserver`
komutunu zorunlu beklediğinden, uyumluluk katmanı olarak bu dosya eklenmiştir.
"""

import sys


def _parse_host_port(argv):
    host = "127.0.0.1"
    port = 5000

    if len(argv) >= 3:
        hp = argv[2]
        if ":" in hp:
            host_part, port_part = hp.rsplit(":", 1)
            host = host_part or host
            if port_part:
                port = int(port_part)
        else:
            port = int(hp)
    return host, port


def main():
    # Beklenen kullanım: python manage.py runserver 0.0.0.0:8181
    if len(sys.argv) >= 2 and sys.argv[1] == "runserver":
        host, port = _parse_host_port(sys.argv)
        from app import app, socketio
        socketio.run(app, host=host, port=port, debug=False)
        return

    # Kısa sağlık kontrolü için:
    # python manage.py check
    if len(sys.argv) >= 2 and sys.argv[1] == "check":
        print("OK")
        return

    print("Kullanım:")
    print("  python manage.py runserver [HOST:PORT]")
    print("  python manage.py check")
    sys.exit(2)


if __name__ == "__main__":
    main()
