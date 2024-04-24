#!/bin/bash
force=false
while getopts 'f' flag; do
    case "${flag}" in
    f) force=true ;;
    *) error "Unexpected option ${flag}" ;;
    esac
done

clear
folder=/Users/mfr/b2/morris-museum/dan/spoon
find $folder -name "full.glb" | while read file; do
    echo "Processing $file"

    highRes="${file%full.glb}highRes.glb"
    lowRes="${file%full.glb}lowRes.glb"

    if [ "$force" = false ] && [ -f "$highRes" ] && [ -f "$lowRes" ]; then
        echo "Skipping $file"
        continue
    fi

    ./node_modules/@gltf-transform/cli/bin//cli.js optimize --compress=quantize --simplify-error 0.001 --texture-size 8194 $file $highRes
    ./node_modules/@gltf-transform/cli/bin//cli.js optimize --compress=quantize --simplify-error 0.01 --texture-size 512 $file $lowRes

done



folder=/Users/mfr/b2/morris-museum/dan/spoon
# rename all 3DModel.glb to highRes.glb, one-liner
find /Users/mfr/b2/morris-museum/dan/spoon -name "3DModel.glb" | while read file; do mv $file "${file%3DModel.glb}highRes.glb"; done