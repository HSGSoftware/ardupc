from flask import Blueprint, request, jsonify
from core import load_saved_locations, save_locations

locations_bp = Blueprint('locations', __name__)


@locations_bp.route('/api/locations', methods=['GET'])
def api_get_locations():
    return jsonify({'success': True, 'locations': load_saved_locations()})


@locations_bp.route('/api/locations', methods=['POST'])
def api_save_location():
    data = request.json or {}
    name = data.get('name', '').strip()
    lat, lng = data.get('lat'), data.get('lng')
    desc = data.get('desc', '')
    if not name or lat is None or lng is None:
        return jsonify({'success': False, 'message': 'İsim ve koordinat gerekli'}), 400
    locations = load_saved_locations()
    locations.append({'name': name, 'lat': float(lat), 'lng': float(lng), 'desc': desc})
    save_locations(locations)
    return jsonify({'success': True, 'message': f'{name} kaydedildi'})


@locations_bp.route('/api/locations/<int:index>', methods=['DELETE'])
def api_delete_location(index):
    locations = load_saved_locations()
    if 0 <= index < len(locations):
        removed = locations.pop(index)
        save_locations(locations)
        return jsonify({'success': True, 'message': f'{removed["name"]} silindi'})
    return jsonify({'success': False, 'message': 'Konum bulunamadı'}), 404
