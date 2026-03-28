"""
SQLite-based flight telemetry logger.
Records telemetry data for replay and analysis.
"""

import sqlite3
import os
import time
import threading
import logging
import json

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'flight_log.db')


class FlightLogger:
    """Logs drone telemetry to SQLite for history and replay."""

    def __init__(self):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()
        self._active_flights = {}

    def _get_conn(self):
        conn = sqlite3.connect(DB_PATH, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS flights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                drone_id TEXT NOT NULL,
                drone_name TEXT,
                vehicle_type TEXT,
                started_at REAL NOT NULL,
                ended_at REAL,
                home_lat REAL,
                home_lng REAL
            );
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                flight_id INTEGER NOT NULL,
                ts REAL NOT NULL,
                lat REAL,
                lng REAL,
                rel_alt REAL,
                abs_alt REAL,
                heading REAL,
                speed REAL,
                climb REAL,
                mode TEXT,
                armed INTEGER,
                bat_pct INTEGER,
                throttle INTEGER,
                FOREIGN KEY (flight_id) REFERENCES flights(id)
            );
            CREATE INDEX IF NOT EXISTS idx_telem_flight ON telemetry(flight_id);
            CREATE INDEX IF NOT EXISTS idx_telem_ts ON telemetry(ts);
        """)
        conn.close()
        logger.info("Flight log database initialized at %s", DB_PATH)

    def start_flight(self, drone_id, drone_name, vehicle_type, home_lat=None, home_lng=None):
        with self._lock:
            conn = self._get_conn()
            cur = conn.execute(
                "INSERT INTO flights (drone_id, drone_name, vehicle_type, started_at, home_lat, home_lng) VALUES (?,?,?,?,?,?)",
                (drone_id, drone_name, vehicle_type, time.time(), home_lat, home_lng)
            )
            flight_id = cur.lastrowid
            conn.commit()
            conn.close()
            self._active_flights[drone_id] = flight_id
            return flight_id

    def end_flight(self, drone_id):
        flight_id = self._active_flights.pop(drone_id, None)
        if flight_id is None:
            return
        with self._lock:
            conn = self._get_conn()
            conn.execute("UPDATE flights SET ended_at=? WHERE id=?", (time.time(), flight_id))
            conn.commit()
            conn.close()

    def log_telemetry(self, drone_id, telem):
        flight_id = self._active_flights.get(drone_id)
        if flight_id is None:
            return
        with self._lock:
            conn = self._get_conn()
            conn.execute(
                "INSERT INTO telemetry (flight_id, ts, lat, lng, rel_alt, abs_alt, heading, speed, climb, mode, armed, bat_pct, throttle) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    flight_id, time.time(),
                    telem.get('lat'), telem.get('lng'),
                    telem.get('rel_alt'), telem.get('abs_alt'),
                    telem.get('heading'), telem.get('speed'),
                    telem.get('climb'), telem.get('mode'),
                    1 if telem.get('armed') else 0,
                    telem.get('bat_pct'), telem.get('throttle')
                )
            )
            conn.commit()
            conn.close()

    def get_flights(self, limit=50):
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT id, drone_id, drone_name, vehicle_type, started_at, ended_at, home_lat, home_lng "
            "FROM flights ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_flight_telemetry(self, flight_id):
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT ts, lat, lng, rel_alt, abs_alt, heading, speed, climb, mode, armed, bat_pct, throttle "
            "FROM telemetry WHERE flight_id=? ORDER BY ts", (flight_id,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_flight_csv(self, flight_id):
        rows = self.get_flight_telemetry(flight_id)
        if not rows:
            return ""
        header = "timestamp,lat,lng,rel_alt,abs_alt,heading,speed,climb,mode,armed,bat_pct,throttle\n"
        lines = []
        for r in rows:
            lines.append(",".join(str(r.get(k, '')) for k in
                         ['ts', 'lat', 'lng', 'rel_alt', 'abs_alt', 'heading', 'speed', 'climb', 'mode', 'armed', 'bat_pct', 'throttle']))
        return header + "\n".join(lines)

    def delete_flight(self, flight_id):
        with self._lock:
            conn = self._get_conn()
            conn.execute("DELETE FROM telemetry WHERE flight_id=?", (flight_id,))
            conn.execute("DELETE FROM flights WHERE id=?", (flight_id,))
            conn.commit()
            conn.close()
