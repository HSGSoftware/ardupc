"""
pymavlink-based MAVLink telemetry listener.
Direct MAVLink message parsing — supplements the regex-based telemetry parser.
"""

import threading
import time
import logging

logger = logging.getLogger(__name__)

try:
    from pymavlink import mavutil
    PYMAVLINK_AVAILABLE = True
except ImportError:
    PYMAVLINK_AVAILABLE = False
    logger.warning("pymavlink not installed — regex-only telemetry mode")

MAVLINK_BASE_PORT = 17550

FLTMODE_MAP = {
    0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
    5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 8: 'LAND', 9: 'DRIFT',
    10: 'SPORT', 11: 'FLIP', 12: 'POSHOLD', 13: 'BRAKE', 14: 'THROW',
    15: 'MANUAL', 17: 'SMART_RTL', 18: 'FLOWHOLD', 19: 'FOLLOW',
    20: 'ZIGZAG', 21: 'SYSTEMID', 22: 'AUTOROTATE', 23: 'AUTO_RTL'
}


class MavlinkService:
    """Manages pymavlink UDP listeners for each drone instance."""

    def __init__(self, socketio, drone_lock, drones):
        self.socketio = socketio
        self.drone_lock = drone_lock
        self.drones = drones
        self.connections = {}
        self.threads = {}
        self._last_emit = {}

    @property
    def available(self):
        return PYMAVLINK_AVAILABLE

    def get_port(self, instance_id):
        return MAVLINK_BASE_PORT + instance_id

    def get_out_address(self, instance_id):
        """Returns the --out argument value for sim_vehicle.py."""
        return f'host.docker.internal:{self.get_port(instance_id)}'

    def start_listener(self, drone_id, instance_id):
        if not PYMAVLINK_AVAILABLE:
            return
        port = self.get_port(instance_id)

        def _listen():
            conn = None
            try:
                conn = mavutil.mavlink_connection(f'udpin:0.0.0.0:{port}')
                self.connections[drone_id] = conn
                logger.info("[MAVLINK] %s listener on UDP %d", drone_id, port)

                while True:
                    with self.drone_lock:
                        if drone_id not in self.drones or self.drones[drone_id].get('status') != 'running':
                            break
                    msg = conn.recv_match(blocking=True, timeout=1)
                    if msg:
                        self._process_message(drone_id, msg)

            except Exception as e:
                logger.error("[MAVLINK] %s error: %s", drone_id, e)
            finally:
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
                self.connections.pop(drone_id, None)
                logger.info("[MAVLINK] %s listener stopped", drone_id)

        t = threading.Thread(target=_listen, daemon=True)
        t.start()
        self.threads[drone_id] = t

    def stop_listener(self, drone_id):
        conn = self.connections.pop(drone_id, None)
        if conn:
            try:
                conn.close()
            except Exception:
                pass

    def _process_message(self, drone_id, msg):
        msg_type = msg.get_type()
        if msg_type == 'BAD_DATA':
            return

        telem = {}

        if msg_type == 'GLOBAL_POSITION_INT':
            telem['lat'] = msg.lat / 1e7
            telem['lng'] = msg.lon / 1e7
            telem['rel_alt'] = msg.relative_alt / 1000.0
            telem['abs_alt'] = msg.alt / 1000.0
            telem['heading'] = msg.hdg / 100.0
            vx, vy = msg.vx / 100.0, msg.vy / 100.0
            telem['speed'] = round((vx**2 + vy**2)**0.5, 2)
            telem['climb'] = -msg.vz / 100.0

        elif msg_type == 'VFR_HUD':
            telem['speed'] = round(msg.groundspeed, 2)
            telem['airspeed'] = round(msg.airspeed, 2)
            telem['heading'] = msg.heading
            telem['abs_alt'] = round(msg.alt, 2)
            telem['climb'] = round(msg.climb, 2)
            telem['throttle'] = msg.throttle

        elif msg_type == 'HEARTBEAT':
            telem['armed'] = bool(msg.base_mode & 128)
            mode_name = FLTMODE_MAP.get(msg.custom_mode)
            if mode_name:
                telem['mode'] = mode_name

        elif msg_type == 'SYS_STATUS':
            telem['bat_volt'] = round(msg.voltage_battery / 1000.0, 2)
            telem['bat_curr'] = round(msg.current_battery / 100.0, 2)
            telem['bat_pct'] = msg.battery_remaining

        elif msg_type == 'GPS_RAW_INT':
            telem['gps_fix'] = msg.fix_type
            telem['gps_sats'] = msg.satellites_visible
            telem['gps_hdop'] = round(msg.eph / 100.0, 2)

        if not telem:
            return

        with self.drone_lock:
            if drone_id in self.drones:
                for key, val in telem.items():
                    self.drones[drone_id][key] = val

        now = time.time()
        last = self._last_emit.get(drone_id, 0)
        if now - last < 0.2:
            return
        self._last_emit[drone_id] = now

        if 'lat' in telem and 'lng' in telem:
            self.socketio.emit('drone_position_update', {
                'drone_id': drone_id,
                'lat': telem['lat'],
                'lng': telem['lng']
            })

        telem['drone_id'] = drone_id
        self.socketio.emit('drone_telemetry_update', telem)
