import time
from flask import Blueprint, request, jsonify
from core import (load_scenarios, save_scenarios, container_state,
                  drones, drone_lock, _start_drone_process, _stop_drone, socketio)

scenarios_bp = Blueprint('scenarios', __name__)


@scenarios_bp.route('/api/scenarios', methods=['GET'])
def api_get_scenarios():
    return jsonify({'success': True, 'scenarios': load_scenarios()})


@scenarios_bp.route('/api/scenarios', methods=['POST'])
def api_save_scenario():
    import core
    data = request.json or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Senaryo adı gerekli'}), 400
    scenarios = load_scenarios()
    current_state = []
    with drone_lock:
        for d in drones.values():
            if d['status'] == 'running':
                current_state.append({
                    'instance_id': d.get('instance_id', 0),
                    'vehicle_type': d.get('vehicle_type', 'ArduCopter'),
                    'ip_addresses': d.get('ip_addresses', []),
                    'lat': d.get('lat'), 'lng': d.get('lng'),
                    'name': d.get('name', '')
                })
    if not current_state:
        return jsonify({'success': False, 'message': 'Hiç aktif drone yok'}), 400
    scenarios[name] = current_state
    save_scenarios(scenarios)
    return jsonify({'success': True, 'message': f'Senaryo "{name}" kaydedildi'})


@scenarios_bp.route('/api/scenarios/duplicate', methods=['POST'])
def api_duplicate_scenario():
    data = request.json or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Senaryo adı gerekli'}), 400
    scenarios = load_scenarios()
    if name not in scenarios:
        return jsonify({'success': False, 'message': 'Senaryo bulunamadı'}), 404
    counter, new_name = 1, f"{name} (Kopya)"
    while new_name in scenarios:
        counter += 1
        new_name = f"{name} (Kopya {counter})"
    scenarios[new_name] = scenarios[name]
    save_scenarios(scenarios)
    return jsonify({'success': True, 'message': f'Senaryo kopyalandı: {new_name}', 'new_name': new_name})


@scenarios_bp.route('/api/scenarios/rename', methods=['POST'])
def api_rename_scenario():
    data = request.json or {}
    old_name, new_name = data.get('old_name', '').strip(), data.get('new_name', '').strip()
    if not old_name or not new_name:
        return jsonify({'success': False, 'message': 'Eski ve yeni isim gerekli'}), 400
    scenarios = load_scenarios()
    if old_name not in scenarios:
        return jsonify({'success': False, 'message': 'Senaryo bulunamadı'}), 404
    if new_name in scenarios:
        return jsonify({'success': False, 'message': 'Bu isimde bir senaryo zaten var'}), 400
    scenarios[new_name] = scenarios.pop(old_name)
    save_scenarios(scenarios)
    return jsonify({'success': True, 'message': 'Senaryo adı değiştirildi'})


@scenarios_bp.route('/api/scenarios/<path:name>', methods=['DELETE'])
def api_delete_scenario(name):
    scenarios = load_scenarios()
    if name in scenarios:
        del scenarios[name]
        save_scenarios(scenarios)
        return jsonify({'success': True, 'message': f'Senaryo "{name}" silindi'})
    return jsonify({'success': False, 'message': 'Senaryo bulunamadı'}), 404


@scenarios_bp.route('/api/scenarios/load', methods=['POST'])
def api_load_scenario():
    import core
    data = request.json or {}
    name = data.get('name', '')
    scenarios = load_scenarios()
    if name not in scenarios:
        return jsonify({'success': False, 'message': 'Senaryo bulunamadı'}), 404
    if container_state['status'] != 'running':
        return jsonify({'success': False, 'message': 'Container çalışmıyor'}), 400

    with drone_lock:
        active_ids = list(drones.keys())
    for did in active_ids:
        _stop_drone(did)
        with drone_lock:
            drones.pop(did, None)
    time.sleep(1)
    socketio.emit('all_drones_removed', {})

    success_count, errors, max_inst = 0, [], 0
    for d_conf in scenarios[name]:
        inst_id = d_conf.get('instance_id', core.drone_counter)
        max_inst = max(max_inst, inst_id)
        ips = d_conf.get('ip_addresses', [])
        if not ips:
            ips = [f'127.0.0.1:{14550 + inst_id * 10}']
        loc = None
        if d_conf.get('lat') is not None and d_conf.get('lng') is not None:
            loc = {'lat': d_conf['lat'], 'lng': d_conf['lng'], 'alt': 0, 'heading': 0}
        res = _start_drone_process(inst_id, ips, d_conf.get('vehicle_type', 'ArduCopter'), loc, d_conf.get('name', ''))
        if res['success']:
            success_count += 1
        else:
            errors.append(f"I{inst_id}: {res.get('message')}")
    with drone_lock:
        core.drone_counter = max_inst + 1
    msg = f'Senaryo yüklendi: {success_count} başlatıldı.'
    if errors:
        msg += f' Hatalar: {", ".join(errors)}'
    return jsonify({'success': True, 'message': msg})
