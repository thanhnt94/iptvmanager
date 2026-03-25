import os
import re

def patch_templates():
    template_dir = 'iptvmanager/app/modules/channels/templates/channels'
    
    # 1. Patch player.html (Full Player)
    filepath = os.path.join(template_dir, 'player.html')
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace HTML structure with Component
        html_pattern = r'<div class="player-container border rounded.*?<div class="mt-3 p-3 bg-white rounded shadow-sm border">'
        html_replacement = """<div class="col-lg-9">
        {% include "_player_component.html" %}
        
        <div class="mt-3 p-3 bg-white rounded shadow-sm border">"""
        content = re.sub(r'<div class="row">.*?<div class="mt-3 p-3 bg-white rounded shadow-sm border">', html_replacement, content, flags=re.DOTALL)
        
        # Update JS to use Component IDs
        content = content.replace("document.getElementById('videoPlayer')", "document.getElementById('iptv-video-element')")
        content = content.replace("document.getElementById('playerOverlay')", "document.getElementById('iptv-player-overlay')")
        content = content.replace("document.getElementById('overlayContent')", "document.getElementById('iptv-player-status')")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
            print("Patched player.html")

    # 2. Patch index.html (Mini Player)
    filepath = os.path.join(template_dir, 'index.html')
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Update JS to use Component IDs
        content = content.replace("document.getElementById('videoPlayer')", "document.getElementById('iptv-video-element')")
        content = content.replace("document.getElementById('playerOverlay')", "document.getElementById('iptv-player-overlay')")
        content = content.replace("document.getElementById('overlayContent')", "document.getElementById('iptv-player-status')")
        
        # Fix playStream to use the new IDs
        content = re.sub(r'window\.IPTVPlayer\.play\(document\.getElementById\(\'videoPlayer\'\)', "window.IPTVPlayer.play(document.getElementById('iptv-video-element')", content)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
            print("Patched index.html")

    # 3. Patch add.html & edit.html (Previews)
    for fn in ['add.html', 'edit.html']:
        filepath = os.path.join(template_dir, fn)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Replace basic video tag with Component
            content = re.sub(r'<div class="ratio ratio-16x9 bg-black.*?</div>\s*</div>', '{% include "_player_component.html" %}', content, flags=re.DOTALL)
            
            # Update JS IDs
            content = content.replace("document.getElementById('videoPlayer')", "document.getElementById('iptv-video-element')")
            content = content.replace("document.getElementById('playerOverlay')", "document.getElementById('iptv-player-overlay')")
            content = content.replace("document.getElementById('playerStatus')", "document.getElementById('iptv-player-status')")
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
                print(f"Patched {fn}")

if __name__ == "__main__":
    patch_templates()
