import os
import re

def remove_emojis_from_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    emoji_pattern = re.compile(
        r'['
        r'\U0001F600-\U0001F64F'  # Emoticons
        r'\U0001F300-\U0001F5FF'  # Misc Symbols and Pictographs
        r'\U0001F680-\U0001F6FF'  # Transport and Map
        r'\U0001F1E0-\U0001F1FF'  # Regional indicator symbols
        r'\U00002702-\U000027B0'  # Dingbats
        r'\U000024C2-\U0001F251'
        r'\U0001F900-\U0001F9FF'  # Supplemental Symbols and Pictographs
        r'\U0001FA70-\U0001FAFF'  # Symbols and Pictographs Extended-A
        r'\u2600-\u26FF'          # Misc symbols
        r'\u2300-\u23FF'          # Misc Technical
        r'\u2B50'                 # Star
        r']+', flags=re.UNICODE)
        
    new_content = emoji_pattern.sub('', content)
    new_content = new_content.replace('\uFE0F', '')

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Removed emojis from {filepath}")

for root, dirs, files in os.walk('.'):
    if '.git' in root or 'node_modules' in root or '__pycache__' in root or 'venv' in root or 'Assets' in root:
        continue
    for file in files:
        if file.endswith(('.py', '.js', '.html', '.css', '.md')):
            try:
                remove_emojis_from_file(os.path.join(root, file))
            except Exception as e:
                pass
