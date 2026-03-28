from flask import Blueprint, request, jsonify
import subprocess
from core import container_state, drones, drone_lock, _stop_drone, check_container_status

container_bp = Blueprint('container', __name__)


@container_bp.route('/api/container/status', methods=['GET'])
def api_container_status():
    status = check_container_status()
    return jsonify({'status': status, 'container_id': container_state['container_id'], 'image': container_state['image']})


@container_bp.route('/api/container/start', methods=['POST'])
def api_container_start():
    if container_state['status'] == 'running':
        return jsonify({'success': False, 'message': 'Container zaten çalışıyor'}), 400
    data = request.json or {}
    image = data.get('image', container_state['image'])
    ports = data.get('ports', [])
    if not ports:
        ports = [{'host': '5770', 'container': '5760', 'protocol': 'tcp'},
                 {'host': '14551', 'container': '14550', 'protocol': 'udp'}]
    cmd = ['docker', 'run', '-d', '--rm']
    for p in ports:
        h, c, pr = p.get('host', ''), p.get('container', ''), p.get('protocol', 'tcp')
        if h and c:
            cmd.extend(['-p', f'{h}:{c}/{pr}'])
    cmd.append(image)
    cmd.extend(['bash', '-c', 'tail -f /dev/null'])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            cid = result.stdout.strip()[:12]
            container_state['container_id'] = cid
            container_state['status'] = 'running'
            container_state['image'] = image
            container_state['ports'] = ports
            return jsonify({'success': True, 'container_id': cid, 'message': 'Container başarıyla başlatıldı'})
        return jsonify({'success': False, 'message': f'Start hatası: {result.stderr}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'Hata: {str(e)}'}), 500


@container_bp.route('/api/container/stop', methods=['POST'])
def api_container_stop():
    if container_state['status'] != 'running':
        return jsonify({'success': False, 'message': 'Çalışan container yok'}), 400
    with drone_lock:
        for did in list(drones.keys()):
            _stop_drone(did)
    try:
        subprocess.run(['docker', 'stop', container_state['container_id']], capture_output=True, timeout=30)
        container_state['container_id'] = None
        container_state['status'] = 'stopped'
        return jsonify({'success': True, 'message': 'Container durduruldu'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Hata: {str(e)}'}), 500
