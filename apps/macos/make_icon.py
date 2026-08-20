from PIL import Image, ImageDraw

SIZE = 1024
RADIUS = 225
TILE = (11, 18, 32, 255)  # deepseek.com dark theme tile (#0B1220)

src = Image.open("AppIcon.svg.png").convert("RGBA")
src_px = src.load()

def inside_rounded_rect(x, y, size, radius):
    if x < radius and y < radius:
        return (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2
    if x < radius and y >= size - radius:
        return (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2
    if x >= size - radius and y < radius:
        return (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius ** 2
    if x >= size - radius and y >= size - radius:
        return (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius ** 2
    return True

canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=RADIUS, fill=TILE)

# Extract the whale (white pixels inside the rounded tile) from the qlmanage render.
whale = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
whale_px = whale.load()
for y in range(SIZE):
    for x in range(SIZE):
        if not inside_rounded_rect(x, y, SIZE, RADIUS):
            continue
        r, g, b, a = src_px[x, y]
        if a > 0 and r > 235 and g > 235 and b > 235:
            whale_px[x, y] = (255, 255, 255, 255)

canvas.alpha_composite(whale)
canvas.save("icon-1024.png")
print("saved icon-1024.png", canvas.getbbox())
