from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import os
import sys
from pathlib import Path

app = Flask(__name__)
CORS(app)

# Get the directory where app.py is located
APP_DIR = Path(__file__).parent
FRONTEND_DIR = APP_DIR / 'frontend' / 'dist'

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'EcoEYE Application'
    }), 200

@app.route('/api/status', methods=['GET'])
def status():
    """Get application status"""
    return jsonify({
        'application': 'EcoEYE',
        'version': '1.0.0',
        'status': 'running',
        'description': 'AI-powered occupancy detection system'
    }), 200

@app.route('/api/zones', methods=['GET'])
def get_zones():
    """Get available zones configuration"""
    zones = [
        {
            'id': 1,
            'name': 'Lounge',
            'area': (0.0, 0.0, 0.5, 1.0),
            'color': (255, 0, 0)
        },
        {
            'id': 2,
            'name': 'Workstations',
            'area': (0.5, 0.0, 1.0, 1.0),
            'color': (0, 255, 0)
        }
    ]
    return jsonify({'zones': zones}), 200

# Serve frontend static files
@app.route('/')
def serve_frontend():
    """Serve the frontend index.html"""
    if FRONTEND_DIR.exists():
        return send_from_directory(FRONTEND_DIR, 'index.html')
    else:
        return jsonify({
            'message': 'EcoEYE API Server',
            'note': 'Frontend build not available, but API is running'
        }), 200

@app.route('/<path:path>')
def serve_static(path):
    """Serve static frontend assets"""
    if FRONTEND_DIR.exists():
        return send_from_directory(FRONTEND_DIR, path)
    return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    print("=" * 50)
    print("EcoEYE Application Starting...")
    print("=" * 50)
    print(f"Frontend dir: {FRONTEND_DIR}")
    print(f"Frontend exists: {FRONTEND_DIR.exists()}")
    print("=" * 50)
    print("Starting Flask server on 0.0.0.0:5000")
    print("Health check: http://localhost:5000/health")
    print("API Status: http://localhost:5000/api/status")
    print("=" * 50)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
