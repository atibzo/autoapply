
import json
import os
from config import personals, questions, search, secrets, settings

def migrate():
    config_data = {}

    # Helper to extract non-dunder attributes
    def extract_vars(module):
        return {k: v for k, v in vars(module).items() if not k.startswith('__') and not callable(v)}

    config_data['personals'] = extract_vars(personals)
    config_data['questions'] = extract_vars(questions)
    config_data['search'] = extract_vars(search)
    config_data['secrets'] = extract_vars(secrets)
    config_data['settings'] = extract_vars(settings)

    # Manual cleanup / organization if needed, but raw dump is a good start
    # We might want to flatten it or keep it nested. Nested is probably safer to avoid name collisions.
    
    with open('config.json', 'w') as f:
        json.dump(config_data, f, indent=4)
    
    print("Migration complete. config.json created.")

if __name__ == "__main__":
    migrate()
