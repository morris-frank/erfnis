#!/bin/bash
if [ "$1" == "-f" ]; then
    force=true
else
    force=false
fi

upstream=/Users/mfr/b2/morris-cloud/docs/ethnography/collection/
downstream=/Users/mfr/b2/morris-museum/

# - Generate small images
for file in $(find "$upstream" -type f -name "*.jpg"); do
    if [[ "$file" == *".small.jpg" ]]; then
        continue
    fi

    smallFile="${file%.jpg}.small.jpg"
    if [ $force == true ] || [ ! -f "$smallFile" ]; then
        echo "Processing $file"
        convert "$file" -auto-orient -strip -resize 512x512\> -quality 80% "$smallFile"
    fi
done

# - Generate images.json
for folder in $(find "$upstream" -type d); do
    echo "Processing $folder"
    find "$folder" -type f -name "*.small.jpg" -exec basename {} \; | jq -R . | jq -s . >"$folder/images.json"
done

# - Sync files
rsync -av --include='*/' --include='*.html' --include='*.json' --include='*.small.jpg' --include='*.glb' --exclude='*' $upstream $downstream

# - Optimize GLB files
for file in $(find "$downstream" -type f -name "*.glb"); do
    if [[ $file == *"highRes"* ]] || [[ $file == *"lowRes"* ]]; then
        continue
    fi

    folder=$(dirname $file)
    highRes="$folder/highRes.glb"
    lowRes="$folder/lowRes.glb"

    if [ $force == true ] || [ ! -f "$highRes" ]; then
        ./node_modules/@gltf-transform/cli/bin//cli.js optimize --compress=quantize --simplify-error 0.001 --texture-size 8194 $file $highRes
    fi

    if [ $force == true ] || [ ! -f "$lowRes" ]; then
        ./node_modules/@gltf-transform/cli/bin//cli.js optimize --compress=quantize --simplify-error 0.005 --texture-size 512 $file $lowRes
    fi
done
