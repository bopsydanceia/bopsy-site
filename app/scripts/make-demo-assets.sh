#!/usr/bin/env bash
# Builds the demo assets of public/demo from the mock-up photos of the app repo
# (fictional AI-generated subjects, design/SPEC.md): dance posters (WebP),
# sample photos to try the flow (JPEG) and the demo clips (MP4 H.264, muted):
# an 8 s "result" and a 2 s 480p-class "preview" per subject.
# Needs Python with Pillow and ffmpeg. Run from app/: bash scripts/make-demo-assets.sh
set -euo pipefail

SRC="${BOPSY_IMAGES:-../../bopsy/assets/images}"
OUT="public/demo"
mkdir -p "$OUT"

python - "$SRC" "$OUT" <<'EOF'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
# Dance posters: 4:5, 360 x 450, WebP.
for name in ["man-dance", "mamie-dance", "woman-dance"]:
    im = Image.open(f"{src}/{name}.jpg").convert("RGB").resize((360, 450), Image.LANCZOS)
    im.save(f"{out}/{name}.webp", "WEBP", quality=68, method=6)
# Sample photos for the demo (the file name drives the fake photo check).
for name in ["man-sit", "mamie-sit"]:
    im = Image.open(f"{src}/{name}.jpg").convert("RGB").resize((640, 800), Image.LANCZOS)
    im.save(f"{out}/{name}.jpg", "JPEG", quality=78, optimize=True, progressive=True)
EOF

# A bouncing camera on the dance photo: a small sway, a beat-synced lift.
bounce="scale=480:600,rotate='0.035*sin(2*PI*t*1.9)':ow=480:oh=600:fillcolor=0x120E18,crop=432:540:x='24+8*sin(2*PI*t*0.95)':y='30-22*abs(sin(2*PI*t*1.9))'"
x264=(-c:v libx264 -preset slow -pix_fmt yuv420p -movflags +faststart -an)

clip() { # subject, sit photo or "", seconds, size, crf, out
  local subject="$1" sit="$2" secs="$3" size="$4" crf="$5" out="$6"
  if [[ -n "$sit" ]]; then
    ffmpeg -y -loglevel error \
      -loop 1 -t 1 -i "$SRC/$sit.jpg" -loop 1 -t "$secs" -i "$SRC/$subject-dance.jpg" \
      -filter_complex "[0]scale=432:540,fps=24,format=yuv420p,settb=1/24[a];[1]$bounce,fps=24,format=yuv420p,settb=1/24[b];[a][b]xfade=transition=fade:duration=0.35:offset=0.6,trim=duration=$secs,scale=$size" \
      "${x264[@]}" -crf "$crf" "$out"
  else
    ffmpeg -y -loglevel error -loop 1 -t "$secs" -i "$SRC/$subject-dance.jpg" \
      -vf "$bounce,fps=24,scale=$size" "${x264[@]}" -crf "$crf" "$out"
  fi
}

for pair in man:man-sit mamie:mamie-sit woman:; do
  subject="${pair%%:*}"; sit="${pair#*:}"
  clip "$subject" "$sit" 8 432:540 30 "$OUT/$subject-result.mp4"
  clip "$subject" "" 2 384:480 34 "$OUT/$subject-preview.mp4"
done

ls -la "$OUT"
