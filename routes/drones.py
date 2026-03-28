import time
from flask import Blueprint, request, jsonify
from core import (container_state, drones, drone_lock, drone_counter,
                  _start_drone_process, _stop_drone, _last_prompt_mode, socketio)

drones_bp = Blueprint('drones', __name__)


@drones_bp.route('/api/drones', methods=['GET'])
def api_drones_list():
    result = []
    with drone_lock:
        for drone_id, drone in drones.items():
            result.append({
                'drone_id': drone['drone_id'], 'instance_id': drone['instance_id'],
                'ip_addresses': drone['ip_addresses'], 'vehicle_type': drone['vehicle_type'],
                'status': drone['status'], 'started_at': drone.get('started_at', ''),
                'lat': drone.get('lat'), 'lng': drone.get('lng'),
                'home_lat': drone.get('home_lat'), 'home_lng': drone.get('home_lng'),
                'mode': drone.get('mode'), 'armed': drone.get('armed'),
                'rel_alt': drone.get('rel_alt'), 'abs_alt': drone.get('abs_alt'),
                'heading': drone.get('heading'), 'speed': drone.get('speed'),
                'climb': drone.get('climb'), 'throttle': drone.get('throttle'),
                'airspeed': drone.get('airspeed'), 'bat_volt': drone.get('bat_volt'),
                'bat_curr': drone.get('bat_curr'), 'bat_pct': drone.get('bat_pct'),
                'gps_fix': drone.get('gps_fix'), 'gps_sats': drone.get('gps_sats'),
                'gps_hdop': drone.get('gps_hdop'),
                'name': drone.get('name', f"Drone I{drone['instance_id']}")
            })
    return jsonify({'success': True, 'drones': result})


@drones_bp.route('/api/drone/start', methods=['POST'])
def api_drone_start():
    import core
    if container_state['status'] != 'running':
        return jsonify({'success': False, 'message': 'Önce container başlatın'}), 400
    data = request.json or {}
    used_ids = set()
    with drone_lock:
        for d in drones.values():
            used_ids.add(d.get('instance_id', -1))
    next_id = 0
    while next_id in used_ids:
        next_id += 1
    instance_id = data.get('instance_id')
    if instance_id is None or str(instance_id) == '':
        instance_id = next_id
    else:
        instance_id = int(instance_id)
    ip_addresses = data.get('ip_addresses', [])
    vehicle_type = data.get('vehicle_type', 'ArduCopter')
    custom_location = data.get('custom_location', None)
    drone_name = data.get('drone_name', f'Drone I{instance_id}')
    if not ip_addresses:
        return jsonify({'success': False, 'message': 'En az bir IP adresi gerekli'}), 400
    drone_id = f'drone_{instance_id}'
    with drone_lock:
        if drone_id in drones and drones[drone_id]['status'] == 'running':
            return jsonify({'success': False, 'message': f'Drone I{instance_id} zaten çalışıyor'}), 400
    result = _start_drone_process(instance_id, ip_addresses, vehicle_type, custom_location, drone_name)
    return jsonify(result) if result['success'] else (jsonify(result), 500)


@drones_bp.route('/api/drone/<drone_id>/stop', methods=['POST'])
def api_drone_stop(drone_id):
    with drone_lock:
        if drone_id not in drones:
            return jsonify({'success': False, 'message': 'Drone bulunamadı'}), 404
        _stop_drone(drone_id)
    socketio.emit('drone_status_update', {'drone_id': drone_id, 'status': 'stopped'})
    return jsonify({'success': True, 'message': f'{drone_id} durduruldu'})


@drones_bp.route('/api/drone/<drone_id>/remove', methods=['POST'])
def api_drone_remove(drone_id):
    with drone_lock:
        if drone_id in drones:
            _stop_drone(drone_id)
            del drones[drone_id]
    _last_prompt_mode.pop(drone_id, None)
    socketio.emit('drone_removed', {'drone_id': drone_id})
    return jsonify({'success': True, 'message': f'{drone_id} kaldırıldı'})


@drones_bp.route('/api/drones/all', methods=['DELETE'])
def api_delete_all_drones():
    with drone_lock:
        for did in list(drones.keys()):
            try:
                _stop_drone(did)
            except Exception:
                pass
            if did in drones:
                del drones[did]
    _last_prompt_mode.clear()
    socketio.emit('all_drones_removed', {})
    return jsonify({'success': True, 'message': 'Tüm dronelar silindi'})


@drones_bp.route('/api/drone/send', methods=['POST'])
def api_drone_send_input():
    data = request.json or {}
    drone_id = data.get('drone_id')
    command = data.get('command', '')
    with drone_lock:
        if drone_id not in drones:
            return jsonify({'success': False, 'message': 'Drone bulunamadı'}), 404
        drone = drones[drone_id]
        process = drone.get('process')
        if not process or process.poll() is not None:
            return jsonify({'success': False, 'message': 'Drone çalışmıyor'}), 400
        try:
            process.stdin.write(command + '\n')
            process.stdin.flush()
            return jsonify({'success': True, 'message': 'Komut gönderildi'})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Hata: {str(e)}'}), 500
