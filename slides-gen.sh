#!/bin/bash
set -e

# Google Slides to optimized images exporter
# Reads SLIDES_PRESENTATION_ID from .env.local or accepts as argument
# Usage: ./slides-gen.sh [presentation_id_or_url]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/public/images"

# Try to get presentation ID from argument, then .env.local
if [[ -n "$1" ]]; then
    INPUT="$1"
elif [[ -f "$SCRIPT_DIR/.env.local" ]]; then
    INPUT=$(grep -E '^SLIDES_PRESENTATION_ID=' "$SCRIPT_DIR/.env.local" | cut -d'=' -f2-)
fi

if [[ -z "$INPUT" ]]; then
    echo "Error: No presentation ID provided"
    echo "Usage: $0 <presentation_id_or_url>"
    echo "Or set SLIDES_PRESENTATION_ID in .env.local"
    exit 1
fi

# Extract presentation ID from URL if needed
if [[ "$INPUT" == *"docs.google.com"* ]]; then
    PRES_ID=$(echo "$INPUT" | grep -oE '[a-zA-Z0-9_-]{20,}' | head -1)
else
    PRES_ID="$INPUT"
fi

if [[ -z "$PRES_ID" ]]; then
    echo "Error: Could not extract presentation ID"
    exit 1
fi

echo "Presentation ID: ${PRES_ID:0:8}..."
echo "Output directory: $OUTPUT_DIR"

# Create temp and output directories
TEMP_DIR=$(mktemp -d)
mkdir -p "$OUTPUT_DIR"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Step 1: Fetch presentation as PDF
echo "Fetching presentation..."
PDF_FILE="$TEMP_DIR/presentation.pdf"
HTTP_CODE=$(curl -sL -w "%{http_code}" \
    "https://docs.google.com/presentation/d/${PRES_ID}/export/pdf" \
    -o "$PDF_FILE")

if [[ "$HTTP_CODE" != "200" ]] || [[ ! -s "$PDF_FILE" ]]; then
    echo "Error: Failed to download presentation (HTTP $HTTP_CODE)"
    echo "Make sure the presentation is publicly accessible (Anyone with link can view)"
    exit 1
fi

echo "Downloaded PDF: $(du -h "$PDF_FILE" | cut -f1)"

# Step 2: Convert PDF to JPEG images
echo "Converting to images..."
docker run --rm \
    -v "$TEMP_DIR:/data" \
    minidocks/poppler \
    pdftoppm -jpeg -r 150 -jpegopt quality=90 /data/presentation.pdf /data/slide

SLIDE_COUNT=$(ls "$TEMP_DIR"/slide-*.jpg 2>/dev/null | wc -l | tr -d ' ')
if [[ "$SLIDE_COUNT" -eq 0 ]]; then
    echo "Error: No slides extracted"
    exit 1
fi

echo "Extracted $SLIDE_COUNT slides"

# Step 3: Optimize to WebP with zero-padded names
echo "Optimizing for web..."

# Clear existing slides
rm -f "$OUTPUT_DIR"/slide-*.webp

# Convert with zero-padded numbering
docker run --rm \
    -v "$TEMP_DIR:/input" \
    -v "$OUTPUT_DIR:/output" \
    --entrypoint sh \
    dpokidov/imagemagick \
    -c 'i=1; for f in /input/slide-*.jpg; do
        num=$(printf "%02d" $i)
        magick "$f" -quality 85 -resize 1920x1920\> "/output/slide-${num}.webp"
        i=$((i+1))
    done'

# Step 4: Update constants.ts
echo "Updating constants.ts..."
CONSTANTS_FILE="$SCRIPT_DIR/constants.ts"

{
    echo "import { SlideData } from './types';"
    echo ""
    echo "const base = import.meta.env.BASE_URL;"
    echo ""
    echo "export const IMAGES: SlideData[] = ["
    for i in $(seq 1 "$SLIDE_COUNT"); do
        num=$(printf "%02d" "$i")
        comma=","
        [[ $i -eq $SLIDE_COUNT ]] && comma=""
        echo "  { id: $i, url: \`\${base}images/slide-${num}.webp\`, alt: 'Slide $i' }${comma}"
    done
    echo "];"
} > "$CONSTANTS_FILE"

echo "Updated constants.ts with $SLIDE_COUNT slides"

# Summary
echo ""
echo "Done! Exported $SLIDE_COUNT slides to $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"/*.webp
echo ""
echo "Total size: $(du -sh "$OUTPUT_DIR" | cut -f1)"
echo ""
echo "Next steps:"
echo "  git add public/images/ constants.ts"
echo "  git commit -m 'chore: update slides'"
echo "  git push"
