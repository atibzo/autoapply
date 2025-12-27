
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
    
    # Check if running in a serverless/restricted environment
    import shutil
    
    errors = []
    
    # Check for Chrome
    chrome_path = shutil.which('google-chrome') or shutil.which('chromium-browser') or shutil.which('chromium')
    if not chrome_path:
        errors.append("Chrome browser is not installed or not found in PATH")
    
    # Check for required Python packages
    missing_packages = []
    try:
        import selenium
    except ImportError:
        missing_packages.append("selenium")
    
    try:
        import undetected_chromedriver
    except ImportError:
        missing_packages.append("undetected-chromedriver")
    
    try:
        import pyautogui
    except ImportError:
        missing_packages.append("pyautogui")
    
    if missing_packages:
        errors.append(f"Missing Python packages: {', '.join(missing_packages)}. Run: pip install {' '.join(missing_packages)}")
    
    # Check for display (needed for non-headless mode)
    if not os.environ.get('DISPLAY') and os.name != 'nt':  # Not Windows
        config_data = get_config()
        run_in_background = config_data.get('settings', {}).get('run_in_background', False)
        if not run_in_background:
            errors.append("No display found. This bot requires a graphical environment or enable 'Run in Background' (headless mode) in Settings")
    
    # Check if this looks like a serverless environment (Vercel, AWS Lambda, etc.)
    if os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME') or os.environ.get('FUNCTIONS_WORKER_RUNTIME'):
        errors.append("This bot cannot run on serverless platforms (Vercel, AWS Lambda, Azure Functions). It requires a local machine with Chrome browser installed.")
    
    if errors:
        return jsonify({
            "error": "Bot cannot start due to environment issues",
            "details": errors,
            "status": "error",
            "suggestion": "This bot is designed to run locally on your computer. Please run it on a machine with Chrome installed."
        }), 400
    
    if bot_process and bot_process.poll() is None:
        return jsonify({"message": "Bot is already running", "status": "running"}), 400
    
    try:
        # Run runAiBot.py using the current python interpreter
        bot_process = subprocess.Popen(
            [sys.executable, 'runAiBot.py'], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        
        # Wait briefly to check if process started successfully
        import time
        time.sleep(2)
        
        if bot_process.poll() is not None:
            # Process already exited - there was an error
            stdout, stderr = bot_process.communicate()
            error_output = stderr or stdout or "Unknown error - bot exited immediately"
            return jsonify({
                "error": "Bot failed to start",
                "details": [error_output[:1000]],  # Limit error length
                "status": "error"
            }), 500
        
        return jsonify({"message": "Bot started successfully", "pid": bot_process.pid, "status": "running"}), 200
    except Exception as e:
        return jsonify({
            "error": "Failed to start bot",
            "details": [str(e)],
            "status": "error"
        }), 500

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

@app.route('/api/environment/check', methods=['GET'])
def check_environment():
    """Check if the environment can run the bot and return compatibility info"""
    import shutil
    
    checks = {
        "chrome_installed": False,
        "selenium_installed": False,
        "display_available": False,
        "is_serverless": False,
        "platform": sys.platform,
        "errors": [],
        "warnings": []
    }
    
    # Check for Chrome
    chrome_path = shutil.which('google-chrome') or shutil.which('chromium-browser') or shutil.which('chromium')
    if chrome_path:
        checks["chrome_installed"] = True
    else:
        checks["errors"].append("Chrome browser is not installed")
    
    # Check for required Python packages
    try:
        import selenium
        checks["selenium_installed"] = True
    except ImportError:
        checks["errors"].append("Python package 'selenium' is not installed")
    
    try:
        import undetected_chromedriver
    except ImportError:
        checks["errors"].append("Python package 'undetected-chromedriver' is not installed")
    
    # Check for display
    if os.environ.get('DISPLAY') or os.name == 'nt':
        checks["display_available"] = True
    else:
        checks["warnings"].append("No display detected. Enable 'Run in Background' mode in Settings for headless operation.")
    
    # Check for serverless environment
    if os.environ.get('VERCEL'):
        checks["is_serverless"] = True
        checks["errors"].append("⚠️ Running on Vercel - This bot CANNOT run on serverless platforms. It requires a local machine with Chrome browser.")
    elif os.environ.get('AWS_LAMBDA_FUNCTION_NAME'):
        checks["is_serverless"] = True
        checks["errors"].append("⚠️ Running on AWS Lambda - This bot CANNOT run on serverless platforms.")
    elif os.environ.get('FUNCTIONS_WORKER_RUNTIME'):
        checks["is_serverless"] = True
        checks["errors"].append("⚠️ Running on Azure Functions - This bot CANNOT run on serverless platforms.")
    
    checks["compatible"] = len(checks["errors"]) == 0
    
    return jsonify(checks)

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
