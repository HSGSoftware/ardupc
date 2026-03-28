"""
ArduPilot SITL Simülatör Web Yönetim Aracı
Docker container içinde çalışan ArduPilot SITL simülatörlerini yönetir.
"""

import threading
import json
import logging
from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO, emit

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ardupilot-sitl-manager-secret'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Services
from services.mavlink_service import MavlinkService
from services.flight_logger import FlightLogger

import core
flight_logger = FlightLogger()
mavlink_svc = MavlinkService(socketio, core.drone_lock, core.drones)
core.init_services(socketio, mavlink_svc, flight_logger)

# Blueprints
from routes.container import container_bp
from routes.drones import drones_bp
from routes.locations import locations_bp
from routes.scenarios import scenarios_bp

app.register_blueprint(container_bp)
app.register_blueprint(drones_bp)
app.register_blueprint(locations_bp)
app.register_blueprint(scenarios_bp)


# ==================== PAGE ROUTES ====================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/map')
def map_page():
    return render_template('map.html')


# ==================== FLIGHT HISTORY API ====================

@app.route('/api/flights', methods=['GET'])
def api_get_flights():
    flights = flight_logger.get_flights(limit=100)
    return jsonify({'success': True, 'flights': flights})


@app.route('/api/flights/<int:flight_id>/telemetry', methods=['GET'])
def api_get_flight_telemetry(flight_id):
    data = flight_logger.get_flight_telemetry(flight_id)
    return jsonify({'success': True, 'telemetry': data})


@app.route('/api/flights/<int:flight_id>/csv', methods=['GET'])
def api_get_flight_csv(flight_id):
    csv_data = flight_logger.get_flight_csv(flight_id)
    return Response(csv_data, mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename=flight_{flight_id}.csv'})


@app.route('/api/flights/<int:flight_id>', methods=['DELETE'])
def api_delete_flight(flight_id):
    flight_logger.delete_flight(flight_id)
    return jsonify({'success': True, 'message': 'Uçuş kaydı silindi'})


# ==================== EXPORT / IMPORT API ====================

@app.route('/api/export/scenarios', methods=['GET'])
def api_export_scenarios():
    scenarios = core.load_scenarios()
    return Response(
        json.dumps(scenarios, ensure_ascii=False, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename=scenarios_export.json'}
    )


@app.route('/api/export/locations', methods=['GET'])
def api_export_locations():
    locations = core.load_saved_locations()
    return Response(
        json.dumps(locations, ensure_ascii=False, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename=locations_export.json'}
    )


@app.route('/api/import/scenarios', methods=['POST'])
def api_import_scenarios():
    data = request.json
    if not data or not isinstance(data, dict):
        return jsonify({'success': False, 'message': 'Geçersiz senaryo verisi'}), 400
    scenarios = core.load_scenarios()
    imported = 0
    for name, drones_list in data.items():
        if isinstance(drones_list, list):
            scenarios[name] = drones_list
            imported += 1
    core.save_scenarios(scenarios)
    return jsonify({'success': True, 'message': f'{imported} senaryo içe aktarıldı'})


@app.route('/api/import/locations', methods=['POST'])
def api_import_locations():
    data = request.json
    if not data or not isinstance(data, list):
        return jsonify({'success': False, 'message': 'Geçersiz konum verisi'}), 400
    locations = core.load_saved_locations()
    imported = 0
    for loc in data:
        if isinstance(loc, dict) and 'name' in loc and 'lat' in loc and 'lng' in loc:
            locations.append(loc)
            imported += 1
    core.save_locations(locations)
    return jsonify({'success': True, 'message': f'{imported} konum içe aktarıldı'})


# ==================== SOCKET EVENTS ====================

@socketio.on('connect')
def handle_connect():
    emit('connection_response', {'status': 'connected'})


@socketio.on('disconnect')
def handle_disconnect():
    pass


@socketio.on('request_drone_output')
def handle_request_output(data):
    drone_id = data.get('drone_id')
    emit('drone_output', {'drone_id': drone_id, 'data': f'[{drone_id}] terminale bağlanıldı...\n'})


@socketio.on('drone_command')
def handle_drone_command(data):
    drone_id = data.get('drone_id')
    command = data.get('command', '')
    with core.drone_lock:
        if drone_id not in core.drones:
            emit('terminal_output', {'drone_id': drone_id, 'output': f'[HATA] {drone_id} bulunamadı\n'})
            return
        drone = core.drones[drone_id]
        process = drone.get('process')
        if not process or process.poll() is not None:
            emit('terminal_output', {'drone_id': drone_id, 'output': f'[HATA] {drone_id} çalışmıyor\n'})
            return
        try:
            process.stdin.write(command + '\n')
            process.stdin.flush()
        except Exception as e:
            emit('terminal_output', {'drone_id': drone_id, 'output': f'[HATA] Komut hatası: {e}\n'})


# ==================== BACKGROUND ====================

def _background_monitor():
    while True:
        try:
            with app.app_context():
                current_status = core.check_container_status()
                socketio.emit('container_status', {
                    'status': current_status,
                    'container_id': core.container_state.get('container_id'),
                    'image': core.container_state.get('image'),
                    'cpu': core.container_state.get('cpu', '0%'),
                    'memory': core.container_state.get('memory', '-')
                })
        except Exception:
            pass
        import time
        time.sleep(2)


if __name__ == '__main__':
    core.check_container_status()
    threading.Thread(target=_background_monitor, daemon=True).start()

    logger.info("=" * 60)
    logger.info("  ArduPilot SITL Simülatör Web Yönetim Aracı")
    logger.info("  http://localhost:5000 adresinden erişebilirsiniz")
    logger.info("  pymavlink: %s", "aktif" if mavlink_svc.available else "pasif (pip install pymavlink)")
    logger.info("=" * 60)
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
