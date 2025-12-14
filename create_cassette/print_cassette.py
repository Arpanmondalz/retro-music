import os
from PIL import Image
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

# --- CONFIGURATION ---
INPUT_FOLDER = "printed_cassettes"  # Folder with your cassette images
OUTPUT_PDF = "cassettes_printable.pdf"

# Page Settings
PAGE_WIDTH, PAGE_HEIGHT = landscape(A4)  # A4 landscape = 297mm x 210mm
MARGIN = 5 * mm  # 5mm margin around the page
COLS = 4  # 4 columns
ROWS = 4  # 4 rows = 16 cassettes per page

# Calculate slot size
USABLE_WIDTH = PAGE_WIDTH - (2 * MARGIN)
USABLE_HEIGHT = PAGE_HEIGHT - (2 * MARGIN)
SLOT_WIDTH = USABLE_WIDTH / COLS
SLOT_HEIGHT = USABLE_HEIGHT / ROWS

print(f"Page Size: {PAGE_WIDTH/mm:.0f}mm x {PAGE_HEIGHT/mm:.0f}mm")
print(f"Slot Size: {SLOT_WIDTH/mm:.1f}mm x {SLOT_HEIGHT/mm:.1f}mm")

def create_print_pdf():
    """
    Reads cassette images and arranges them in a 4x4 grid on A4 pages.
    """
    # Load all cassette images
    cassette_files = sorted([f for f in os.listdir(INPUT_FOLDER) if f.endswith('.jpg')])
    
    if not cassette_files:
        print("No cassette images found!")
        return
    
    print(f"Found {len(cassette_files)} cassettes to arrange.")
    
    # Create PDF
    pdf_canvas = canvas.Canvas(OUTPUT_PDF, pagesize=landscape(A4))
    
    cassette_index = 0
    grid_position = 0  # Position in current grid (0-15)
    
    for cassette_file in cassette_files:
        cassette_path = os.path.join(INPUT_FOLDER, cassette_file)
        
        # Calculate grid position (row, col)
        row = (grid_position % ROWS)
        col = (grid_position // COLS) % COLS
        
        # Start a new page if grid is full (every 16 cassettes)
        if grid_position > 0 and grid_position % 16 == 0:
            pdf_canvas.showPage()  # Save current page and start new one
            col = 0
            row = 0
        
        # Calculate position on page
        x = MARGIN + (col * SLOT_WIDTH)
        y = PAGE_HEIGHT - MARGIN - ((row + 1) * SLOT_HEIGHT)  # Top-to-bottom
        
        # Draw the cassette image (fit within slot)
        try:
            pdf_canvas.drawImage(
                cassette_path,
                x,
                y,
                width=SLOT_WIDTH,
                height=SLOT_HEIGHT,
                preserveAspectRatio=True
            )
        except Exception as e:
            print(f"Error adding {cassette_file}: {e}")
        
        grid_position += 1
    
    # Save the last page
    pdf_canvas.save()
    print(f"PDF created: {OUTPUT_PDF}")
    print(f"Total cassettes: {cassette_index + 1}")
    print(f"Total pages: {(cassette_index // 16) + 1}")

if __name__ == "__main__":
    create_print_pdf()
