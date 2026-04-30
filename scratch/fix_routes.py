import os

file_path = r'c:\Code\Ecosystem\IPTV\app\modules\playlists\routes.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """        else:
            count = len(p.entries)
            for entry in p.entries:
                if entry.channel:
                    if entry.channel.status == 'live': live_count += 1
                    elif entry.channel.status == 'die': die_count += 1
                    else: unknown_count += 1"""

new_block = """        elif getattr(p, 'is_dynamic', False):
            count = len(p.discovery_items)
            for item in p.discovery_items:
                if item.status == 'live': live_count += 1
                elif item.status == 'die': die_count += 1
                else: unknown_count += 1
        else:
            count = len(p.entries)
            for entry in p.entries:
                if entry.channel:
                    if entry.channel.status == 'live': live_count += 1
                    elif entry.channel.status == 'die': die_count += 1
                    else: unknown_count += 1"""

# Try both space and tab versions if needed, but start with spaces as seen in view_file
if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")
else:
    # Try normalized version
    content_norm = content.replace('\t', '    ')
    old_block_norm = old_block.replace('\t', '    ')
    if old_block_norm in content_norm:
        print("Found with normalization, applying...")
        # Actually replace in raw content might be hard, so just overwrite with normalized if possible
        # Or just tell me it failed
        print("Fail: Tab/Space mismatch")
    else:
        print("Fail: Not found")
