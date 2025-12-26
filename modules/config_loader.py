
import json
import os
import threading

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config.json')
_config_lock = threading.Lock()

def load_config():
    """Loads the configuration from the JSON file."""
    with _config_lock:
        if not os.path.exists(CONFIG_PATH):
            return {}
        try:
            with open(CONFIG_PATH, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_config(new_config):
    """Saves the configuration to the JSON file."""
    with _config_lock:
        with open(CONFIG_PATH, 'w') as f:
            json.dump(new_config, f, indent=4)

def update_section(section, data):
    """Updates a specific section of the configuration."""
    config = load_config()
    if section not in config:
        config[section] = {}
    
    # Update only provided keys
    for key, value in data.items():
        config[section][key] = value
        
    save_config(config)

def get_config():
    """Returns the current configuration (cached or fresh read)."""
    return load_config()
