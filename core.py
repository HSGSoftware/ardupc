"""
Shared state and core functions used across blueprints.
"""

import subprocess
import threading
import time
import os
import signal
import json
import re
import logging
import shutil

logger = logging.getLogger(__name__)

# Global state
container_state = {
    'container_id': None,
    'status': 'stopped',
    'image': 'ardupilot-sitl:final',
    'ports': { '5760': '5770', '14550/udp': '14551' },
    'runtime_mode': 'docker',
    'runtime_label': 'Docker',
}

drones = {}
drone_counter = 0
drone_lock = threading.Lock()

# Initialized later by app.py
socketio = None
mavlink_svc = None
flight_logger = None

LOCATIONS_FILE = os.path.join(os.path.dirname(__file__), 'saved_locations.json')
SCENARIOS_FILE = os.path.join(os.path.dirname(__file__), 'scenarios.json')
SIM_VEHICLE_CMD = os.getenv('SIM_VEHICLE_CMD', 'sim_vehicle.py')
RUNTIME_MODE = os.getenv('SITL_RUNTIME_MODE', 'auto').strip().lower()


def detect_runtime_mode():
    docker_exists = shutil.which('docker') is not None
    if RUNTIME_MODE == 'docker':
        return 'docker' if docker_exists else 'host'
    if RUNTIME_MODE == 'host':
        return 'host'
    return 'docker' if docker_exists else 'host'


def is_docker_runtime():
    mode = detect_runtime_mode()
    container_state['runtime_mode'] = mode
    container_state['runtime_label'] = 'Docker' if mode == 'docker' else 'Yerel (Termux/Host)'
    return mode == 'docker'


def init_services(_socketio, _mavlink_svc, _flight_logger):
    global socketio, mavlink_svc, flight_logger
    socketio = _socketio
    mavlink_svc = _mavlink_svc
    flight_logger = _flight_logger


def load_saved_locations():
    if os.path.exists(LOCATIONS_FILE):
        try:
            with open(LOCATIONS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return [
        {'name': 'CMAC', 'lat': -35.363261, 'lng': 149.165230, 'desc': 'Canberra Model Aircraft Club'},
        {'name': 'CMAC East', 'lat': -35.3627, 'lng': 149.1652, 'desc': 'CMAC Doğu'},
    ]


def save_locations(locations):
    with open(LOCATIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(locations, f, ensure_ascii=False, indent=2)


def load_scenarios():
    if os.path.exists(SCENARIOS_FILE):
        try:
            with open(SCENARIOS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_scenarios(scenarios):
    with open(SCENARIOS_FILE, 'w', encoding='utf-8') as f:
        json.dump(scenarios, f, ensure_ascii=False, indent=2)


VALID_MODES = frozenset({
    'STABILIZE', 'ACRO', 'ALT_HOLD', 'AUTO', 'GUIDED', 'LOITER', 'RTL',
    'CIRCLE', 'LAND', 'DRIFT', 'SPORT', 'FLIP', 'POSHOLD', 'BRAKE',
    'THROW', 'MANUAL', 'SMART_RTL', 'FLOWHOLD', 'FOLLOW', 'ZIGZAG',
    'AUTOTUNE', 'QSTABILIZE', 'QHOVER', 'QLOITER', 'QLAND', 'QRTL'
})

FLTMODE_MAP = {
    0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
    5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 8: 'LAND', 9: 'DRIFT',
    10: 'SPORT', 11: 'FLIP', 12: 'POSHOLD', 13: 'BRAKE', 14: 'THROW',
    15: 'MANUAL', 17: 'SMART_RTL', 18: 'FLOWHOLD', 19: 'FOLLOW',
    20: 'ZIGZAG', 21: 'SYSTEMID', 22: 'AUTOROTATE', 23: 'AUTO_RTL'
}

_last_prompt_mode = {}


def _parse_mavlink_fields(field_str):
    fields = {}
    for item in field_str.split(','):
        parts = item.split(':')
        if len(parts) == 2:
            fields[parts[0].strip()] = parts[1].strip()
    return fields


def _parse_line_telemetry(line, drone_id):
    telem = {}
    now = time.time()

    prompt_match = re.match(r'^([A-Z][A-Z0-9_]+)>\s*', line)
    if prompt_match:
        m = prompt_match.group(1)
        if m in VALID_MODES:
            telem['mode'] = m
            _last_prompt_mode[drone_id] = (m, now)

    mode_msg = re.search(r'Mode\s+(?:changed\s+to\s+)?([A-Z][A-Z0-9_]+)', line)
    if mode_msg and mode_msg.group(1) in VALID_MODES:
        telem['mode'] = mode_msg.group(1)
        _last_prompt_mode[drone_id] = (mode_msg.group(1), now)

    gpi = re.search(r'GLOBAL_POSITION_INT\s*\{([^}]+)\}', line)
    if gpi:
        f = _parse_mavlink_fields(gpi.group(1))
        try:
            if 'lat' in f and 'lon' in f:
                telem['lat'] = int(f['lat']) / 1e7
                telem['lng'] = int(f['lon']) / 1e7
            if 'relative_alt' in f:
                telem['rel_alt'] = int(f['relative_alt']) / 1000.0
            if 'alt' in f:
                telem['abs_alt'] = int(f['alt']) / 1000.0
            if 'hdg' in f:
                telem['heading'] = int(f['hdg']) / 100.0
            if 'vx' in f and 'vy' in f:
                vx, vy = int(f['vx']) / 100.0, int(f['vy']) / 100.0
                telem['speed'] = round((vx**2 + vy**2)**0.5, 2)
            if 'vz' in f:
                telem['climb'] = -int(f['vz']) / 100.0
        except (ValueError, TypeError):
            pass

    vfr = re.search(r'VFR_HUD\s*\{([^}]+)\}', line)
    if vfr:
        f = _parse_mavlink_fields(vfr.group(1))
        try:
            if 'groundspeed' in f: telem['speed'] = float(f['groundspeed'])
            if 'heading' in f: telem['heading'] = float(f['heading'])
            if 'alt' in f: telem['abs_alt'] = float(f['alt'])
            if 'climb' in f: telem['climb'] = float(f['climb'])
            if 'throttle' in f: telem['throttle'] = int(f['throttle'])
            if 'airspeed' in f: telem['airspeed'] = float(f['airspeed'])
        except (ValueError, TypeError):
            pass

    hb = re.search(r'HEARTBEAT\s*\{([^}]+)\}', line)
    if hb:
        f = _parse_mavlink_fields(hb.group(1))
        try:
            if 'base_mode' in f:
                telem['armed'] = bool(int(f['base_mode']) & 128)
            if 'custom_mode' in f and 'mode' not in telem:
                last = _last_prompt_mode.get(drone_id, (None, 0))
                if now - last[1] > 2:
                    mode_name = FLTMODE_MAP.get(int(f['custom_mode']))
                    if mode_name:
                        telem['mode'] = mode_name
        except (ValueError, TypeError):
            pass

    sys_match = re.search(r'SYS_STATUS\s*\{([^}]+)\}', line)
    if sys_match:
        f = _parse_mavlink_fields(sys_match.group(1))
        try:
            if 'voltage_battery' in f: telem['bat_volt'] = round(int(f['voltage_battery']) / 1000.0, 2)
            if 'current_battery' in f: telem['bat_curr'] = round(int(f['current_battery']) / 100.0, 2)
            if 'battery_remaining' in f: telem['bat_pct'] = int(f['battery_remaining'])
        except (ValueError, TypeError):
            pass

    gps = re.search(r'GPS_RAW_INT\s*\{([^}]+)\}', line)
    if gps:
        f = _parse_mavlink_fields(gps.group(1))
        try:
            if 'fix_type' in f: telem['gps_fix'] = int(f['fix_type'])
            if 'satellites_visible' in f: telem['gps_sats'] = int(f['satellites_visible'])
            if 'eph' in f: telem['gps_hdop'] = round(int(f['eph']) / 100.0, 2)
        except (ValueError, TypeError):
            pass

    if 'ARM_DISARM' in line and 'ACCEPTED' in line:
        telem['arm_ack'] = True
    if re.search(r'APM:\s*ARMED', line, re.I):
        telem['armed'] = True
    elif re.search(r'APM:\s*DISARMED', line, re.I):
        telem['armed'] = False

    return telem


def stream_drone_output(drone_id, process):
    try:
        while process.poll() is None:
            line = process.stdout.readline()
            if not line:
                time.sleep(0.05)
                continue
            telem = _parse_line_telemetry(line, drone_id)
            if telem:
                with drone_lock:
                    if drone_id in drones:
                        d = drones[drone_id]
                        if 'lat' in telem and 'lng' in telem:
                            d['lat'] = telem['lat']
                            d['lng'] = telem['lng']
                        for key in ('mode', 'armed', 'rel_alt', 'abs_alt', 'heading',
                                    'speed', 'climb', 'throttle', 'airspeed',
                                    'bat_volt', 'bat_curr', 'bat_pct',
                                    'gps_fix', 'gps_sats', 'gps_hdop'):
                            if key in telem:
                                d[key] = telem[key]
                if 'lat' in telem and 'lng' in telem:
                    socketio.emit('drone_position_update', {
                        'drone_id': drone_id, 'lat': telem['lat'], 'lng': telem['lng']
                    })
                telem['drone_id'] = drone_id
                socketio.emit('drone_telemetry_update', telem)
                if 'lat' in telem or 'mode' in telem or 'armed' in telem:
                    flight_logger.log_telemetry(drone_id, telem)
            socketio.emit('drone_output', {'drone_id': drone_id, 'data': line})
        remaining = process.stdout.read()
        if remaining:
            socketio.emit('drone_output', {'drone_id': drone_id, 'data': remaining})
        with drone_lock:
            if drone_id in drones:
                drones[drone_id]['status'] = 'stopped'
                socketio.emit('drone_status_update', {'drone_id': drone_id, 'status': 'stopped'})
    except Exception as e:
        socketio.emit('drone_output', {'drone_id': drone_id, 'data': f'\n[HATA] {e}\n'})


def stream_drone_stderr(drone_id, process):
    try:
        while process.poll() is None:
            line = process.stderr.readline()
            if line:
                socketio.emit('drone_output', {'drone_id': drone_id, 'data': line})
            else:
                time.sleep(0.1)
        remaining = process.stderr.read()
        if remaining:
            socketio.emit('drone_output', {'drone_id': drone_id, 'data': remaining})
    except Exception:
        pass


def _start_drone_process(instance_id, ip_addresses, vehicle_type, custom_location, drone_name):
    global drone_counter
    drone_id = f'drone_{instance_id}'
    out_params = ' '.join([f'--out=udp:{ip}' for ip in ip_addresses])
    if mavlink_svc and mavlink_svc.available:
        out_params += f' --out=udp:{mavlink_svc.get_out_address(instance_id)}'
    sim_cmd = f'{SIM_VEHICLE_CMD} -v {vehicle_type} -I{instance_id} --no-rebuild {out_params}'

    if custom_location:
        if isinstance(custom_location, str):
            sim_cmd += f' --custom-location={custom_location}'
        else:
            lat = custom_location.get('lat', '')
            lng = custom_location.get('lng', '')
            alt = custom_location.get('alt') or '0'
            heading = custom_location.get('heading') or '0'
            if lat and lng:
                sim_cmd += f' --custom-location={lat},{lng},{alt},{heading}'

    if is_docker_runtime():
        exec_cmd = ['docker', 'exec', '-i', container_state['container_id'], 'bash', '-lc', sim_cmd]
    else:
        exec_cmd = ['bash', '-lc', sim_cmd]

    try:
        process = subprocess.Popen(
            exec_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE,
            text=True, bufsize=1,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
        lat_val, lng_val = None, None
        if custom_location:
            try:
                if isinstance(custom_location, str):
                    parts = custom_location.split(',')
                    if len(parts) >= 2:
                        lat_val, lng_val = float(parts[0]), float(parts[1])
                else:
                    lat_val = float(custom_location.get('lat', 0))
                    lng_val = float(custom_location.get('lng', 0))
            except (ValueError, TypeError):
                pass

        drone_info = {
            'drone_id': drone_id, 'instance_id': instance_id,
            'ip_addresses': ip_addresses, 'vehicle_type': vehicle_type,
            'status': 'running', 'process': process, 'command': sim_cmd,
            'started_at': time.strftime('%H:%M:%S'),
            'lat': lat_val, 'lng': lng_val,
            'home_lat': lat_val, 'home_lng': lng_val, 'name': drone_name
        }
        with drone_lock:
            drones[drone_id] = drone_info
            if instance_id >= drone_counter:
                drone_counter = instance_id + 1

        for target, args in [
            (stream_drone_output, (drone_id, process)),
            (stream_drone_stderr, (drone_id, process)),
            (periodic_telemetry, (drone_id, process)),
        ]:
            threading.Thread(target=target, args=args, daemon=True).start()

        if mavlink_svc:
            mavlink_svc.start_listener(drone_id, instance_id)
        if flight_logger:
            flight_logger.start_flight(drone_id, drone_name, vehicle_type, lat_val, lng_val)

        return {'success': True, 'drone_id': drone_id, 'instance_id': instance_id,
                'message': f'Drone {drone_name} başlatıldı'}
    except Exception as e:
        return {'success': False, 'message': f'Drone başlatma hatası: {str(e)}'}


def periodic_telemetry(drone_id, process):
    time.sleep(15)
    while process.poll() is None:
        try:
            with drone_lock:
                if drone_id not in drones or drones[drone_id]['status'] != 'running':
                    break
            if process.stdin and not process.stdin.closed:
                process.stdin.write('status\n')
                process.stdin.flush()
        except (BrokenPipeError, OSError):
            break
        except Exception:
            pass
        time.sleep(2)


def _stop_drone(drone_id):
    if drone_id in drones:
        drone = drones[drone_id]
        process = drone.get('process')
        if process and process.poll() is None:
            try:
                if os.name == 'nt':
                    process.terminate()
                else:
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                process.wait(timeout=5)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass
        drone['status'] = 'stopped'
        if mavlink_svc:
            mavlink_svc.stop_listener(drone_id)
        if flight_logger:
            flight_logger.end_flight(drone_id)


def check_container_status():
    if not is_docker_runtime():
        container_state['container_id'] = 'host-runtime'
        container_state['status'] = 'running'
        container_state['cpu'] = '-'
        container_state['memory'] = '-'
        return container_state['status']
    try:
        container_id = container_state.get('container_id')
        if not container_id:
            cmd = ['docker', 'ps', '--filter', f'ancestor={container_state.get("image", "ardupilot-sitl:final")}', '--format', '{{.ID}}']
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0 and res.stdout.strip():
                container_id = res.stdout.strip().split('\n')[0]
                container_state['container_id'] = container_id
        if container_id:
            res = subprocess.run(['docker', 'inspect', '--format', '{{.State.Running}}', container_id], capture_output=True, text=True)
            if res.stdout.strip() == 'true':
                container_state['status'] = 'running'
                res_stats = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{.CPUPerc}};{{.MemUsage}}', container_id], capture_output=True, text=True)
                if res_stats.returncode == 0:
                    parts = res_stats.stdout.strip().split(';')
                    if len(parts) >= 2:
                        container_state['cpu'] = parts[0]
                        container_state['memory'] = parts[1].split('/')[0].strip()
            else:
                container_state['status'] = 'stopped'
        else:
            container_state['status'] = 'stopped'
    except Exception:
        container_state['status'] = 'stopped'
    return container_state['status']
