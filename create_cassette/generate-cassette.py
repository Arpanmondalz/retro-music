import os
import io
import requests
import numpy as np
import qrcode
import colorsys
import random
from PIL import Image, ImageDraw, ImageFont, ImageOps
from colorthief import ColorThief
import yt_dlp

# --- CONFIGURATION ---
TEMPLATE_PATH = "template.png"
INPUT_FILE = "songs.txt"
OUTPUT_DIR = "printed_cassettes"
FONT_PATH = "bold_font.ttf"
FONT_SIZE_TITLE = 70
FONT_SIZE_VERTICAL = 40

WHITE_THRESH = 230
BLACK_THRESH = 100

os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_video_details(url):
    clean_url = url.replace("music.youtube.com", "youtube.com")
    ydl_opts = {'quiet': True, 'skip_download': True, 'no_warnings': True, 'extract_flat': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
            return {
                "title": info.get('title', 'Unknown'),
                "artist": info.get('uploader', 'Unknown'),
                "thumb_url": info.get('thumbnail'),
                "clean_url": clean_url
            }
    except: return None

def get_artistic_palette(thumb_bytes):
    """
    Aggressively finds the most interesting hue and boosts its saturation.
    """
    ct = ColorThief(io.BytesIO(thumb_bytes))
    palette = ct.get_palette(color_count=8, quality=1)
    
    best_color = palette[0]
    max_score = -1
    
    for rgb in palette:
        h, s, v = colorsys.rgb_to_hsv(rgb[0]/255, rgb[1]/255, rgb[2]/255)
        
        # Score = Saturation * 3 + Brightness. We want COLOR.
        # We ignore very dark colors (v < 0.2) or very white colors (s < 0.05, v > 0.9)
        if v > 0.2 and not (s < 0.05 and v > 0.8):
            score = (s * 3.0) + v
            if score > max_score:
                max_score = score
                best_color = rgb
    
    # Force Saturation Boost
    # Convert 'Best Color' to HSV, pump up Saturation, convert back.
    h, s, v = colorsys.rgb_to_hsv(best_color[0]/255, best_color[1]/255, best_color[2]/255)
    
    # If image is totally gray (Saturation < 10%), force a cool color (Cyan/Teal/Purple) based on Title Hash?
    # Or just default to a "Retro Cyan"
    if s < 0.1:
        # Fallback to a nice vibrant Teal
        h, s, v = 0.5, 0.6, 0.7 
    else:
        # Boost existing color: Ensure at least 60% Saturation
        s = max(s, 0.6)
        # Ensure it's not too dark
        v = max(v, 0.7)

    # 1. Generate Background (Pastel Version of the Boosted Color)
    # Lower saturation for BG, High Brightness
    r_bg, g_bg, b_bg = colorsys.hsv_to_rgb(h, 0.25, 0.95)
    bg_accent = (int(r_bg*255), int(g_bg*255), int(b_bg*255))
    
    # 2. Generate Foreground (Deep/Vibrant Version)
    # High saturation, Darker Value
    r_fg, g_fg, b_fg = colorsys.hsv_to_rgb(h, 0.9, 0.4)
    fg_accent = (int(r_fg*255), int(g_fg*255), int(b_fg*255))
    
    return bg_accent, fg_accent

def process_image(thumb_bytes, template_path):
    bg_accent, fg_accent = get_artistic_palette(thumb_bytes)
    
    img = Image.open(template_path).convert("RGBA")
    data = np.array(img)
    r, g, b, a = data.T
    
    white_areas = (r > WHITE_THRESH) & (g > WHITE_THRESH) & (b > WHITE_THRESH)
    data[..., :-1][white_areas.T] = bg_accent
    
    black_areas = (r < BLACK_THRESH) & (g < BLACK_THRESH) & (b < BLACK_THRESH)
    data[..., :-1][black_areas.T] = fg_accent

    return Image.fromarray(data), bg_accent, fg_accent

def generate_cassette(url):
    print(f"Processing: {url}...")
    data = get_video_details(url)
    if not data: return

    try:
        thumb_resp = requests.get(data['thumb_url'])
        thumb_bytes = thumb_resp.content
        base_img, bg_color, fg_color = process_image(thumb_bytes, TEMPLATE_PATH)
        draw = ImageDraw.Draw(base_img)
        W, H = base_img.size

        # QR Code (480px)
        qr = qrcode.QRCode(box_size=10, border=0)
        qr.add_data(data['clean_url'])
        qr.make(fit=True)
        
        qr_mask = qr.make_image(image_factory=None).convert("L")
        qr_target_size = 750
        qr_mask = qr_mask.resize((qr_target_size, qr_target_size), resample=Image.NEAREST)
        
        qr_color_block = Image.new("RGBA", (qr_target_size, qr_target_size), fg_color)
        qr_final = Image.new("RGBA", (qr_target_size, qr_target_size), (0,0,0,0))
        qr_mask_inverted = ImageOps.invert(qr_mask)
        qr_final.paste(qr_color_block, (0,0), qr_mask_inverted)
        base_img.paste(qr_final, (320, 350), qr_final)

        # Thumbnail (240px)
        thumb_raw = Image.open(io.BytesIO(thumb_bytes)).convert("RGB")
        thumb_size = 180
        mask = Image.new('L', (thumb_size, thumb_size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, thumb_size, thumb_size), fill=255)
        thumb_circ = ImageOps.fit(thumb_raw, mask.size, centering=(0.5, 0.5))
        thumb_circ.putalpha(mask)
        base_img.paste(thumb_circ, (1100, 350), thumb_circ)

        # Text
        try:
            font_title = ImageFont.truetype(FONT_PATH, FONT_SIZE_TITLE)
            font_vert = ImageFont.truetype(FONT_PATH, FONT_SIZE_VERTICAL)
        except:
            font_title = ImageFont.load_default()
            font_vert = ImageFont.load_default()

        # Title
        raw_title = f"{data['title']}".upper()
        
        # Logic: If longer than 25 chars, take first 25 and add "..."
        if len(raw_title) > 25:
            title_str = raw_title[:25] + "..."
        else:
            title_str = raw_title
            
        draw.text((W//2, 100), title_str, fill=fg_color, font=font_title, anchor="mm")

        # Vertical Text
        txt_layer = Image.new('RGBA', (600, 600), (255, 255, 255, 0))
        d_txt = ImageDraw.Draw(txt_layer)
        
        # Prepare Title (Limit 25)
        if len(data['title']) > 25:
            display_title = data['title'][:25] + "..."
        else:
            display_title = data['title']

        # Prepare Artist (Limit 25)
        if len(data['artist']) > 25:
            display_artist = data['artist'][:25] + "..."
        else:
            display_artist = data['artist']
        
        d_txt.text((0, 0), display_title, fill=fg_color, font=font_vert)
        d_txt.text((0, 60), display_artist, fill=fg_color, font=font_vert)

        
        rotated_txt = txt_layer.rotate(270, expand=True)
        base_img.paste(rotated_txt, (650, 580), rotated_txt)

        # Save
        final_rgb = base_img.convert("RGB")
        safe_filename = "".join([c for c in data['title'] if c.isalnum() or c==' ']).strip()[:50]
        final_rgb.save(os.path.join(OUTPUT_DIR, f"{safe_filename}.jpg"), quality=95)
        print(f"Saved: {safe_filename}.jpg")

    except Exception as e:
        print(f"Failed {url}: {e}")

if __name__ == "__main__":
    if os.path.exists(INPUT_FILE):
        with open(INPUT_FILE, 'r') as f:
            for line in f:
                if line.strip(): generate_cassette(line.strip())
