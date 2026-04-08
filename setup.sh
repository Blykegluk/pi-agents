#!/bin/bash
# Pi Agents — Setup script for a new machine
# Run from the repo root: bash setup.sh
set -e

echo "=== Pi Agents Setup ==="

# Detect username
USERNAME=$(whoami)
PI_DIR="$HOME/.pi/agent"

# 1. Install dashboard dependencies
echo "[1/6] Installing dashboard..."
cd dashboard
npm install
cd ..

# 2. Create .env.local for dashboard
echo "[2/6] Configuring dashboard environment..."
if [ ! -f dashboard/.env.local ]; then
    sed "s/<USERNAME>/$USERNAME/g" dashboard/.env.example > dashboard/.env.local
    echo "  Created dashboard/.env.local"
else
    echo "  dashboard/.env.local already exists, skipping"
fi

# 3. Set up Pi Agent directory structure
echo "[3/6] Setting up Pi Agent config (~/.pi/agent/)..."
mkdir -p "$PI_DIR/agents" "$PI_DIR/prompts" "$PI_DIR/sessions"

# Copy agents
cp -n agents/*.md "$PI_DIR/agents/" 2>/dev/null || true
echo "  Copied agent definitions to $PI_DIR/agents/"

# Copy prompts
cp -n prompts/*.md "$PI_DIR/prompts/" 2>/dev/null || true
echo "  Copied workflow prompts to $PI_DIR/prompts/"

# Copy settings
cp -n settings.json "$PI_DIR/settings.json" 2>/dev/null || true
echo "  Copied settings.json"

# Copy workflows
cp -n workflows.json "$PI_DIR/workflows.json" 2>/dev/null || true
echo "  Copied workflows.json"

# 4. Set up apis.json (user must fill in keys)
echo "[4/6] Setting up API keys..."
if [ ! -f "$PI_DIR/apis.json" ]; then
    cp apis.json.example "$PI_DIR/apis.json"
    echo "  Created $PI_DIR/apis.json — EDIT THIS FILE TO ADD YOUR API KEYS"
else
    echo "  $PI_DIR/apis.json already exists, skipping"
fi

# 5. Create music pool
echo "[5/6] Generating background music pool..."
MUSIC_DIR="Videos/music-pool"
mkdir -p "$MUSIC_DIR"
if [ ! -f "$MUSIC_DIR/dark-cinematic-01.mp3" ]; then
    for i in 1 2 3 4 5; do
        FREQ=$((50 + i * 10))
        FREQ2=$((FREQ + 27))
        FREQ3=$((FREQ + 55))
        ffmpeg -y -f lavfi -i "sine=frequency=$FREQ:duration=30" \
            -f lavfi -i "sine=frequency=$FREQ2:duration=30" \
            -f lavfi -i "sine=frequency=$FREQ3:duration=30" \
            -filter_complex "[0]volume=0.3[a];[1]volume=0.2,tremolo=f=$((i+1)):d=0.3[b];[2]volume=0.15[c];[a][b][c]amix=inputs=3,lowpass=f=300,afade=t=in:d=2,afade=t=out:st=27:d=3[out]" \
            -map "[out]" -ac 2 -ar 44100 "$MUSIC_DIR/dark-cinematic-0${i}.mp3" 2>/dev/null
        echo "  Generated track $i/5"
    done
else
    echo "  Music pool already exists, skipping"
fi

# 6. Update pipeline.sh paths
echo "[6/6] Updating pipeline.sh paths..."
REPO_DIR=$(pwd)
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "mingw"* ]]; then
    REPO_DIR=$(pwd -W 2>/dev/null | sed 's|\\|/|g' || pwd)
fi
sed -i "s|C:/Users/antho/Documents/1. Projets AI/13. Pi Agents|$REPO_DIR|g" pipeline.sh
echo "  Updated paths in pipeline.sh to: $REPO_DIR"

# Also update runner.ts pipeline path
sed -i "s|C:/Users/antho/Documents/1. Projets AI/13. Pi Agents/pipeline.sh|$REPO_DIR/pipeline.sh|g" dashboard/src/lib/runner.ts
echo "  Updated paths in runner.ts"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "NEXT STEPS:"
echo "  1. Edit ~/.pi/agent/apis.json and add your API keys:"
echo "     - MINIMAX_API_KEY (from platform.minimax.io)"
echo "     - ELEVENLABS_API_KEY (from elevenlabs.io)"
echo "     - YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN"
echo ""
echo "  2. Start the dashboard:"
echo "     cd dashboard && npm run dev"
echo ""
echo "  3. Open http://localhost:3000"
echo ""
echo "  4. The video workflow runs automatically every day at 14h (Europe/Paris)"
echo "     Or trigger manually: curl -X POST http://localhost:3000/api/workflows/wf-1774948113603/run -H 'Content-Type: application/json' -d '{\"task\": \"Generate and publish next daily video\"}'"
