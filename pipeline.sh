#!/bin/bash
# Full video pipeline: generate → edit → publish
# Usage: ./pipeline.sh < script_json_from_stdin
# Or: ./pipeline.sh "$(cat data/content/2026-04-04.json)"
set -u

# ---- CONFIG ----
MINIMAX_API_KEY="${MINIMAX_API_KEY:?MINIMAX_API_KEY not set}"
ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:?ELEVENLABS_API_KEY not set}"
YOUTUBE_CLIENT_ID="${YOUTUBE_CLIENT_ID:?YOUTUBE_CLIENT_ID not set}"
YOUTUBE_CLIENT_SECRET="${YOUTUBE_CLIENT_SECRET:?YOUTUBE_CLIENT_SECRET not set}"
YOUTUBE_REFRESH_TOKEN="${YOUTUBE_REFRESH_TOKEN:?YOUTUBE_REFRESH_TOKEN not set}"
BASE_URL="https://api.minimax.io/v1"
PROJECT_DIR="C:/Users/antho/Documents/1. Projets AI/13. Pi Agents"
MUSIC_POOL="$PROJECT_DIR/Videos/music-pool"

# ---- READ INPUT ----
# The script output file path is passed as $1
# IMPORTANT: We read from file with cat|python to avoid backtick interpretation by bash
if [ -f "$1" ]; then
    SCRIPT_FILE="$1"
    # Handle double indirection: if file content is itself a path to another file
    FIRST_LINE=$(head -1 "$SCRIPT_FILE" | tr -d '[:space:]')
    if [ -f "$FIRST_LINE" ]; then
        echo "Double indirection detected, reading from: $FIRST_LINE"
        SCRIPT_FILE="$FIRST_LINE"
    fi
else
    # If not a file, write to temp file to avoid bash escaping issues
    SCRIPT_FILE="/tmp/pi-dashboard/pipeline-input-$$.txt"
    printf '%s' "$1" > "$SCRIPT_FILE"
fi

echo "Script file: $SCRIPT_FILE ($(wc -c < "$SCRIPT_FILE") bytes)"

# Parse the script input to extract narration, scenes, and metadata
# All parsing uses cat "$SCRIPT_FILE" | python to avoid bash mangling backticks/quotes
NARRATION=$(cat "$SCRIPT_FILE" | python -c "
import sys, re
text = sys.stdin.read()
script_parts = []

# Method 1: Quoted text on lines containing HOOK/TENSION/etc markers
for line in text.split('\n'):
    for marker in ['HOOK', 'TENSION', 'EXPLANATION', 'PUNCHLINE', 'EXPLICATION']:
        if marker.upper() in line.upper():
            m = re.search(r'\"(.+?)\"', line)
            if m:
                script_parts.append(m.group(1))

# Method 2: Table format | **HOOK** | timing | text | (marker in col 1)
if len(script_parts) < 3:
    script_parts = []
    rows = re.findall(r'\|\s*\*?\*?(?:HOOK|TENSION|EXPLIC\w+|PUNCHLINE)[^|]*\|[^|]*\|\s*(.+?)\s*\|', text, re.I)
    for r in rows:
        clean = r.strip().strip('|').strip()
        if clean and len(clean) > 5:
            script_parts.append(clean)

# Method 3: Table format | timing | HOOK | text | (marker in col 2)
if len(script_parts) < 3:
    script_parts = []
    rows = re.findall(r'\|[^|]*\|\s*\*?\*?(?:HOOK|TENSION|EXPLIC\w+|PUNCHLINE)[^|]*\|\s*(.+?)\s*\|', text, re.I)
    for r in rows:
        clean = r.strip().strip('|').strip()
        if clean and len(clean) > 5:
            script_parts.append(clean)

# Method 4: Lines after HOOK:/TENSION: etc in code blocks
if len(script_parts) < 3:
    script_parts = []
    blocks = re.findall(r'(?:HOOK|TENSION|EXPLIC\w+|PUNCHLINE)[^:]*:\s*\n\"(.+?)\"', text, re.I)
    script_parts = list(blocks)

# Method 5: Any line with a marker, grab everything after the last pipe/colon
if len(script_parts) < 3:
    script_parts = []
    for line in text.split('\n'):
        for marker in ['HOOK', 'TENSION', 'EXPLANATION', 'PUNCHLINE', 'EXPLICATION']:
            if marker in line.upper():
                # Grab text after last | that looks like narration (>10 chars, starts with capital)
                parts = line.split('|')
                for p in reversed(parts):
                    clean = p.strip().strip('*').strip()
                    if len(clean) > 10 and clean[0].isupper() and not any(x in clean for x in ['---','Scene','**']):
                        script_parts.append(clean)
                        break

# Method 6: Fallback - first 4 quoted strings > 10 chars
if len(script_parts) < 3:
    parts = re.findall(r'\"([^\"]{10,})\"', text)
    script_parts = parts[:4] if parts else []

print(' '.join(script_parts) if script_parts else '')
" 2>/dev/null)

YT_TITLE=$(cat "$SCRIPT_FILE" | python -c "
import sys, re
text = sys.stdin.read()
title = ''
# Pattern 1: **Title:**\n\`\`\`\nActual Title\n (markdown code block after Title:)
m = re.search(r'\*?\*?Title\*?\*?.*?\n\`\`\`\n(.+?)\n', text, re.S)
if m: title = m.group(1).strip()
# Pattern 2: Title: Actual Title (inline)
if not title:
    m = re.search(r'Title[:\s]+([A-Z].+?)$', text, re.M)
    if m: title = m.group(1).strip()
# Pattern 3: YouTube Title\n\`Actual Title\`
if not title:
    m = re.search(r'YouTube.*Title.*?\n\`(.+?)\`', text, re.S)
    if m: title = m.group(1).strip()
# Clean up
title = title.strip('\`\"*')
print(title if title and len(title) > 3 else 'New Video')
" 2>/dev/null)

YT_DESC=$(cat "$SCRIPT_FILE" | python -c "
import sys, re
text = sys.stdin.read()
m = re.search(r'YouTube.*?Description.*?\n\`\`\`\n(.*?)\`\`\`', text, re.S)
if m: print(m.group(1).strip())
else: print('Your body is smarter than you think.\n\n#shorts #fitness #science #health #fyp')
" 2>/dev/null)

TIKTOK_DESC=$(cat "$SCRIPT_FILE" | python -c "
import sys, re
text = sys.stdin.read()
m = re.search(r'TikTok.*?Description.*?\n\`\`\`\n(.*?)\`\`\`', text, re.S) or re.search(r'TikTok.*?\n\`(.*?)\`', text, re.S)
if m: print(m.group(1).strip())
else: print('#fitness #science #health #fyp')
" 2>/dev/null)

echo "=== PIPELINE START ==="
echo "Narration: ${NARRATION:0:100}..."
echo "YT Title: $YT_TITLE"

# Validate narration is not empty
if [ -z "$NARRATION" ] || [ "$(echo "$NARRATION" | wc -w)" -lt 5 ]; then
    echo "ERROR: Narration is empty or too short. Aborting pipeline."
    echo "Script file: $SCRIPT_FILE"
    echo "Content preview:"
    head -20 "$SCRIPT_FILE"
    exit 1
fi

# ---- STEP 1: EXTRACT SCENE PROMPTS ----
ANTI_ARTIFACT="No CGI, no animation, no 3D render — photorealistic only. Natural human anatomy, correct number of fingers, realistic body proportions. No distorted faces, no uncanny valley effects, no morphing artifacts. IMPORTANT: Subject must be CENTERED in the frame. All action, faces, and key elements must be in the CENTER THIRD of the image. This video will be cropped from 16:9 to 9:16 portrait."

# Extract scene prompts - try multiple patterns
SCENE_PROMPTS=$(cat "$SCRIPT_FILE" | python -c "
import sys, re
text = sys.stdin.read()
scenes = []
# Pattern 1: 'prompt': 'xxx' or prompt: xxx
found = re.findall(r'[\"\']*prompt[\"\']*\s*[:=]\s*[\"\']*(.+?)[\"\']*(?:\n|$)', text, re.I)
if found: scenes = found
# Pattern 2: Scene N: description
if len(scenes) < 4:
    found = re.findall(r'Scene\s*\d+\s*:\s*(.+?)(?:\n|$)', text, re.I)
    if len(found) >= 4: scenes = found
# Pattern 3: Numbered list items with visual descriptions
if len(scenes) < 4:
    found = re.findall(r'\d+\.\s*\*\*(.+?)\*\*\s*[-—:]+\s*(.+?)(?:\n|$)', text)
    if found: scenes = [f'{a} {b}' for a,b in found]
# Pattern 4: Lines containing 'Cinematic' or 'shot' or 'close-up'
if len(scenes) < 4:
    found = re.findall(r'((?:Cinematic|Close-up|Medium|Wide|Overhead).+?)(?:\n|$)', text, re.I)
    if found: scenes = found
# Pattern 5: Any lines after scene/visual keywords
if len(scenes) < 4:
    found = re.findall(r'(?:visual|description|scene)\s*[:\-]\s*(.+?)(?:\n|$)', text, re.I)
    if found: scenes = found
for i, s in enumerate(scenes[:4]):
    print(f'SCENE_{i+1}={s.strip()[:500]}')
" 2>/dev/null)

echo "Parsed scenes:"
echo "$SCENE_PROMPTS"

# ---- STEP 2: GENERATE VIDEOS (MiniMax) ----
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
WORK_DIR="$PROJECT_DIR/Videos/video-$TIMESTAMP"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

echo "Work dir: $WORK_DIR"

# GUARD: Exactly 4 scenes, never more
SCENE_COUNT=$(echo "$SCENE_PROMPTS" | grep -c "SCENE_" || true)
if [ "$SCENE_COUNT" -lt 4 ]; then
    echo "WARNING: Only $SCENE_COUNT scenes parsed, padding with fallbacks"
fi

# GUARD: Check MiniMax balance before spending
echo "Checking MiniMax balance..."
BALANCE_CHECK=$(curl -s -X POST "$BASE_URL/video_generation" \
    -H "Authorization: Bearer $MINIMAX_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model": "video-01", "prompt": "test"}' 2>/dev/null)
BALANCE_STATUS=$(echo "$BALANCE_CHECK" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('base_resp',{}).get('status_msg','ok'))" 2>/dev/null)
if echo "$BALANCE_STATUS" | grep -qi "insufficient"; then
    echo "ERROR: MiniMax insufficient balance. Aborting."
    exit 1
fi
# The test above may have created a task — it will be ignored (not polled)

echo "Creating 4 MiniMax tasks..."
TASK_IDS=()
CREATED=0
for i in 1 2 3 4; do
    PROMPT=$(echo "$SCENE_PROMPTS" | grep "SCENE_${i}=" | sed "s/SCENE_${i}=//" || true)
    if [ -z "$PROMPT" ]; then
        echo "WARNING: No prompt for scene $i, using fallback"
        case $i in
            1) PROMPT="Cinematic close-up of a fit athlete in dark gym, dramatic moody lighting, determined expression" ;;
            2) PROMPT="Cinematic medium shot of athletic person exercising intensely, sweat visible, dramatic shadows" ;;
            3) PROMPT="Cinematic overhead shot of fitness equipment and health items on dark surface, warm studio lighting" ;;
            4) PROMPT="Cinematic medium close-up of confident athlete looking directly at camera, powerful expression, dramatic rim lighting" ;;
        esac
    fi
    FULL_PROMPT="$PROMPT $ANTI_ARTIFACT"

    # Escape for JSON
    ESCAPED=$(echo "$FULL_PROMPT" | sed 's/"/\\"/g' | tr '\n' ' ')

    RESPONSE=$(curl -s -X POST "$BASE_URL/video_generation" \
        -H "Authorization: Bearer $MINIMAX_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"video-01\", \"prompt\": \"$ESCAPED\"}")

    TASK_ID=$(echo "$RESPONSE" | python -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))" 2>/dev/null)
    STATUS_MSG=$(echo "$RESPONSE" | python -c "import sys,json; print(json.load(sys.stdin).get('base_resp',{}).get('status_msg',''))" 2>/dev/null)

    if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "" ]; then
        echo "Scene $i → FAILED: $STATUS_MSG"
        if echo "$STATUS_MSG" | grep -qi "insufficient"; then
            echo "ERROR: MiniMax balance depleted mid-generation. Aborting."
            exit 1
        fi
    else
        echo "Scene $i → Task: $TASK_ID"
        echo "$TASK_ID" > "scene-0${i}.task_id"
        TASK_IDS+=("$TASK_ID")
        CREATED=$((CREATED+1))
    fi
done

if [ "$CREATED" -lt 3 ]; then
    echo "ERROR: Only $CREATED/4 scenes created. Aborting."
    exit 1
fi

# Poll until all done — with retry on failure (max 1 retry per scene with safe prompt)
echo "Polling for completion..."
declare -A SCENE_FAILED  # Track failed scenes to avoid infinite polling
DOWNLOADED=0

for poll in $(seq 1 30); do
    ALL_DONE=true
    for i in 0 1 2 3; do
        IDX=$((i+1))
        SCENE="scene-0${IDX}"
        [ -f "${SCENE}.mp4" ] && continue
        [ "${SCENE_FAILED[$SCENE]:-0}" -ge 2 ] && continue  # Skip permanently failed scenes
        ALL_DONE=false

        STATUS_RESP=$(curl -s "$BASE_URL/query/video_generation?task_id=${TASK_IDS[$i]}" \
            -H "Authorization: Bearer $MINIMAX_API_KEY")
        STATUS=$(echo "$STATUS_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
        STATUS_MSG=$(echo "$STATUS_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('base_resp',{}).get('status_msg',''))" 2>/dev/null)

        if [ "$STATUS" = "Success" ]; then
            FILE_ID=$(echo "$STATUS_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('file_id',''))" 2>/dev/null)
            echo "$FILE_ID" > "${SCENE}.file_id"
            FILE_RESP=$(curl -s "$BASE_URL/files/retrieve?file_id=$FILE_ID" \
                -H "Authorization: Bearer $MINIMAX_API_KEY")
            DL_URL=$(echo "$FILE_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('file',{}).get('download_url',''))" 2>/dev/null)
            curl -s -o "${SCENE}.mp4" "$DL_URL"
            echo "[$poll] ${SCENE} ✅ $(du -h ${SCENE}.mp4 | cut -f1)"
            DOWNLOADED=$((DOWNLOADED+1))
        elif [ "$STATUS" = "Fail" ]; then
            FAIL_COUNT=${SCENE_FAILED[$SCENE]:-0}
            FAIL_COUNT=$((FAIL_COUNT+1))
            SCENE_FAILED[$SCENE]=$FAIL_COUNT
            echo "[$poll] ${SCENE} ❌ FAILED ($STATUS_MSG) — attempt $FAIL_COUNT/2"

            if [ "$FAIL_COUNT" -lt 2 ]; then
                # Retry with a safe generic prompt (avoids content moderation)
                SAFE_PROMPTS=("Cinematic close-up of a fit athlete in a dark gym, dramatic moody lighting, determined expression, sweat visible. $ANTI_ARTIFACT"
                    "Cinematic medium shot of athletic person lifting weights intensely, dramatic shadows and warm lighting. $ANTI_ARTIFACT"
                    "Cinematic shot of gym equipment with dramatic lighting, weights and dumbbells, dark moody atmosphere. $ANTI_ARTIFACT"
                    "Cinematic close-up of confident athlete looking at camera, powerful expression, dramatic rim lighting. $ANTI_ARTIFACT")
                SAFE_PROMPT="${SAFE_PROMPTS[$i]}"
                ESCAPED=$(echo "$SAFE_PROMPT" | sed 's/"/\\"/g' | tr '\n' ' ')
                RETRY_RESP=$(curl -s -X POST "$BASE_URL/video_generation" \
                    -H "Authorization: Bearer $MINIMAX_API_KEY" \
                    -H "Content-Type: application/json" \
                    -d "{\"model\": \"video-01\", \"prompt\": \"$ESCAPED\"}")
                NEW_TASK=$(echo "$RETRY_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))" 2>/dev/null)
                if [ -n "$NEW_TASK" ] && [ "$NEW_TASK" != "" ]; then
                    echo "[$poll] ${SCENE} 🔄 Retrying with safe prompt → Task: $NEW_TASK"
                    TASK_IDS[$i]="$NEW_TASK"
                    echo "$NEW_TASK" > "${SCENE}.task_id"
                else
                    echo "[$poll] ${SCENE} ❌ Retry also failed to create task"
                    SCENE_FAILED[$SCENE]=2
                fi
            else
                echo "[$poll] ${SCENE} ⛔ Permanently failed, skipping"
            fi
        fi
    done
    $ALL_DONE && break
    # Also break if we have enough scenes (at least 3)
    if [ "$DOWNLOADED" -ge 3 ]; then
        STILL_PENDING=false
        for i in 0 1 2 3; do
            SCENE="scene-0$((i+1))"
            [ -f "${SCENE}.mp4" ] && continue
            [ "${SCENE_FAILED[$SCENE]:-0}" -ge 2 ] && continue
            STILL_PENDING=true
        done
        $STILL_PENDING || break
    fi
    sleep 30
done

echo "Downloaded: $DOWNLOADED/4 scenes"
if [ "$DOWNLOADED" -lt 3 ]; then
    echo "ERROR: Only $DOWNLOADED scenes succeeded. Need at least 3. Aborting."
    exit 1
fi

# Assemble raw video — only include scenes that exist
> filelist.txt
for i in 1 2 3 4; do
    if [ -f "scene-0${i}.mp4" ]; then
        echo "file 'scene-0${i}.mp4'" >> filelist.txt
    fi
done
ffmpeg -y -f concat -safe 0 -i filelist.txt -c copy final-video.mp4 2>/dev/null
VID_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-video.mp4)
echo "Raw video: ${VID_DUR}s"

# ---- STEP 3: VIDEO EDITOR ----
# Voiceover
echo "Generating voiceover..."
ESCAPED_NARRATION=$(echo "$NARRATION" | sed 's/"/\\"/g')
curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/IKne3meq5aSn9XLyUdCD" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -o voiceover.mp3 \
  -d "{\"text\": \"$ESCAPED_NARRATION\", \"model_id\": \"eleven_flash_v2_5\", \"voice_settings\": {\"stability\": 0.5, \"similarity_boost\": 0.75, \"style\": 0.3}}"

# Verify it's audio
if file voiceover.mp3 | grep -q "JSON"; then
    echo "ERROR: ElevenLabs returned error"
    cat voiceover.mp3
    exit 1
fi

# Fit voiceover to video duration
VO_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 voiceover.mp3)
RATIO=$(python -c "v=$VO_DUR; d=$VID_DUR; r=v/d; print(r if r>1.01 else 1.0)")
if [ "$RATIO" != "1.0" ]; then
    echo "Fitting voiceover: ${VO_DUR}s → ${VID_DUR}s (atempo=$RATIO)"
    ffmpeg -y -i voiceover.mp3 -filter:a "atempo=$RATIO" -ac 2 -ar 44100 voiceover-fitted.mp3 2>/dev/null
    mv voiceover-fitted.mp3 voiceover.mp3
fi

# Music (random from pool)
TRACK=$(ls "$MUSIC_POOL"/dark-cinematic-*.mp3 2>/dev/null | shuf -n 1)
if [ -n "$TRACK" ]; then
    cp "$TRACK" music.mp3
    echo "Music: $(basename "$TRACK")"
else
    echo "WARNING: No music pool found"
    ffmpeg -y -f lavfi -i "sine=frequency=55:duration=30" -filter_complex "volume=0.3,lowpass=f=200" -ac 2 -ar 44100 music.mp3 2>/dev/null
fi

# Mix audio
ffmpeg -y -i voiceover.mp3 -i music.mp3 \
  -filter_complex "[1]volume=0.15[bg];[0][bg]amix=inputs=2:duration=first" \
  -ac 2 -ar 44100 mixed-audio.mp3 2>/dev/null

# Subtitles
FITTED_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 voiceover.mp3)
python << PYEOF
words = """$NARRATION""".upper().replace("'", "").split()
duration = float("$FITTED_DUR")
total = len(words)
tpw = duration / total
highlight = {'LEGALLY','DRUNK','IMPAIRS','IDENTICAL','BLOOD','ALCOHOL','LIMIT','IMPAIRED','24','HOURS','SHUTS','CALORIES','NEURONS','GLUCOSE','PERCENT','DISSOLVES','STEEL','DOPAMINE','BURNS','BIGGEST','WARNING','PREDICTS','MUSCLE','MEMORY','STRONGER','NEVER'}
blocks = []
i = 0
while i < total:
    sz = min(3, total - i)
    bw = words[i:i+sz]
    s, e = i*tpw, (i+sz)*tpw
    hl = any(w in highlight for w in bw)
    blocks.append((s,e,' '.join(bw),hl))
    i += sz
lines = ['[Script Info]','ScriptType: v4.00+','PlayResX: 1080','PlayResY: 1920','','[V4+ Styles]']
lines.append('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding')
lines.append('Style: Default,Impact,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,10,10,120,1')
lines.append('Style: Highlight,Impact,90,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,10,10,120,1')
lines.extend(['','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'])
for s,e,txt,hl in blocks:
    style='Highlight' if hl else 'Default'
    pfx='{\\\\fscx120\\\\fscy120}' if hl else ''
    sm=int(s//60); ss=s%60; em=int(e//60); es=e%60
    lines.append(f'Dialogue: 0,0:{sm:02d}:{ss:05.2f},0:{em:02d}:{es:05.2f},{style},,0,0,0,,{pfx}{txt}')
with open('subtitles.ass','w') as f: f.write('\n'.join(lines))
print(f'Subtitles: {len(blocks)} blocks')
PYEOF

# Final assembly
ffmpeg -y -i final-video.mp4 -i mixed-audio.mp3 \
  -vf "crop=405:720:437:0,scale=1080:1920,ass=subtitles.ass" \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 128k \
  -shortest final-with-audio.mp4 2>/dev/null
echo "Final video: $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 final-with-audio.mp4)s @ 1080x1920"

# ---- STEP 4: YOUTUBE PUBLISH ----
echo "Publishing to YouTube..."
ACCESS_TOKEN=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$YOUTUBE_CLIENT_ID&client_secret=$YOUTUBE_CLIENT_SECRET&refresh_token=$YOUTUBE_REFRESH_TOKEN&grant_type=refresh_token" \
  | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Escape for JSON
ESCAPED_TITLE=$(echo "$YT_TITLE" | sed 's/"/\\"/g')
ESCAPED_DESC=$(echo "$YT_DESC" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

cat > yt_metadata.json << METAEOF
{
  "snippet": {
    "title": "$ESCAPED_TITLE #shorts",
    "description": "$ESCAPED_DESC",
    "categoryId": "22",
    "tags": ["shorts", "fitness", "health", "science"]
  },
  "status": {
    "privacyStatus": "public",
    "selfDeclaredMadeForKids": false
  }
}
METAEOF

UPLOAD_URL=$(curl -s -X POST \
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -D upload_headers.txt \
  -d @yt_metadata.json -o /dev/null && grep -i '^location:' upload_headers.txt | tr -d '\r' | sed 's/^[Ll]ocation: //')

if [ -n "$UPLOAD_URL" ]; then
    VIDEO_ID=$(curl -s -X PUT "$UPLOAD_URL" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: video/mp4" \
      --data-binary @final-with-audio.mp4 \
      | python -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    echo "=== YOUTUBE PUBLISHED ==="
    echo "URL: https://youtube.com/shorts/$VIDEO_ID"
else
    echo "ERROR: YouTube upload failed"
fi

echo "=== PIPELINE COMPLETE ==="
echo "Video dir: $WORK_DIR"
