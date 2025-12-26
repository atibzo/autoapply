
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import csv
from datetime import datetime
import os
import subprocess
import json
import sys
from modules.config_loader import get_config, save_config, update_section

app = Flask(__name__)
CORS(app)

# --- Configuration & Paths ---
PATH = 'all excels/'  # Keep existing path logic for now, though it should ideally come from config
INTERACTION_FILE = 'interaction.json'
bot_process = None

# Ensure interaction file exists
if not os.path.exists(INTERACTION_FILE):
    with open(INTERACTION_FILE, 'w') as f:
        json.dump({"status": "idle"}, f)

def get_interaction_status():
    try:
        if os.path.exists(INTERACTION_FILE):
            with open(INTERACTION_FILE, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return {"status": "idle"}

def set_interaction_response(response_text):
    status = get_interaction_status()
    if status.get("status") == "waiting":
        status["status"] = "responded"
        status["response"] = response_text
        with open(INTERACTION_FILE, 'w') as f:
            json.dump(status, f)
        return True
    return False

# --- Routes ---

@app.route('/')
def home():
    """Displays the home page of the application."""
    return render_template('index.html')

@app.route('/api/config', methods=['GET'])
def get_configuration():
    return jsonify(get_config())

@app.route('/api/config', methods=['POST'])
def save_configuration():
    try:
        new_config = request.json
        save_config(new_config)
        return jsonify({"message": "Configuration saved successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/bot/start', methods=['POST'])
def start_bot():
    global bot_process
    if bot_process and bot_process.poll() is None:
        return jsonify({"message": "Bot is already running", "status": "running"}), 400
    
    try:
        # Run runAiBot.py using the current python interpreter
        bot_process = subprocess.Popen([sys.executable, 'runAiBot.py'], 
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE,
                                     text=True)
        return jsonify({"message": "Bot started", "pid": bot_process.pid, "status": "running"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/bot/stop', methods=['POST'])
def stop_bot():
    global bot_process
    if bot_process and bot_process.poll() is None:
        bot_process.terminate()
        bot_process = None
        return jsonify({"message": "Bot stopped", "status": "stopped"}), 200
    return jsonify({"message": "Bot is not running", "status": "stopped"}), 400

@app.route('/api/bot/status', methods=['GET'])
def bot_status():
    global bot_process
    status = "stopped"
    if bot_process and bot_process.poll() is None:
        status = "running"
    
    interaction = get_interaction_status()
    
    return jsonify({
        "status": status,
        "interaction": interaction
    })

@app.route('/api/bot/interact', methods=['POST'])
def bot_interact():
    data = request.json
    response_text = data.get('response')
    if set_interaction_response(response_text):
        return jsonify({"message": "Response sent to bot"}), 200
    return jsonify({"error": "Bot is not waiting for input"}), 400


# --- Existing Routes ---

@app.route('/applied-jobs', methods=['GET'])
def get_applied_jobs():
    '''
    Retrieves a list of applied jobs from the applications history CSV file.
    '''
    try:
        jobs = []
        # Ensure directory exists
        if not os.path.exists(PATH):
            os.makedirs(PATH)
            
        csv_path = os.path.join(PATH, 'all_applied_applications_history.csv')
        if not os.path.exists(csv_path):
             return jsonify([]), 200 # Return empty list if no file

        with open(csv_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                jobs.append({
                    'Job_ID': row.get('Job ID', ''),
                    'Title': row.get('Title', ''),
                    'Company': row.get('Company', ''),
                    'HR_Name': row.get('HR Name', ''),
                    'HR_Link': row.get('HR Link', ''),
                    'Job_Link': row.get('Job Link', ''),
                    'External_Job_link': row.get('External Job link', ''),
                    'Date_Applied': row.get('Date Applied', '')
                })
        return jsonify(jobs)
    except FileNotFoundError:
        return jsonify({"error": "No applications history found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/applied-jobs/<job_id>', methods=['PUT'])
def update_applied_date(job_id):
    """
    Updates the 'Date Applied' field of a job in the applications history CSV file.
    """
    try:
        data = []
        csvPath = os.path.join(PATH, 'all_applied_applications_history.csv')
        
        if not os.path.exists(csvPath):
            return jsonify({"error": f"CSV file not found at {csvPath}"}), 404
            
        # Read current CSV content
        with open(csvPath, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            fieldNames = reader.fieldnames
            found = False
            for row in reader:
                if row['Job ID'] == job_id:
                    row['Date Applied'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    found = True
                data.append(row)
        
        if not found:
            return jsonify({"error": f"Job ID {job_id} not found"}), 404

        with open(csvPath, 'w', encoding='utf-8', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=fieldNames)
            writer.writeheader()
            writer.writerows(data)
        
        return jsonify({"message": "Date Applied updated successfully"}), 200
    except Exception as e:
        print(f"Error updating applied date: {str(e)}")  # Debug log
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')
