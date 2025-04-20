"""
Tennis Court 3D Web Application

This Flask application serves a 3D tennis court visualization where users can
place tennis balls and targets on the court.
"""
from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def home():
    """
    Render the main page of the application with the 3D tennis court.
    
    Returns:
        rendered HTML template
    """
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    """
    Serve static files (JavaScript, CSS, etc.).
    
    Args:
        path (str): Path to the requested static file
        
    Returns:
        static file content
    """
    return send_from_directory('static', path)

if __name__ == '__main__':
    # Enable debug mode for development
    # Set to False in production
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))