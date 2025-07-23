#!/bin/bash

# Path to your PNG logo
LOGO="static/images/Logos/BitTasker-square-logo.png"
BG="#3F3F3F"

# Output directories
ANDROID_OUT="./android-icons"
IOS_OUT="./ios-icons"

mkdir -p "$ANDROID_OUT" "$IOS_OUT"

# Android icon sizes (px)
declare -A ANDROID_SIZES=(
  [mdpi]=48
  [hdpi]=72
  [xhdpi]=96
  [xxhdpi]=144
  [xxxhdpi]=192
)

for density in "${!ANDROID_SIZES[@]}"; do
  size=${ANDROID_SIZES[$density]}
  out="$ANDROID_OUT/ic_launcher_${density}.png"
  magick -size ${size}x${size} xc:"$BG" \
    \( "$LOGO" -resize $((size*3/4))x$((size*3/4)) \) \
    -gravity center -composite "$out"
  echo "Android $density: $out"
done

# iOS icon sizes (px)
declare -A IOS_SIZES=(
  [20@2x]=40 [20@3x]=60 [29@2x]=58 [29@3x]=87 [40@2x]=80 [40@3x]=120 \
  [60@2x]=120 [60@3x]=180 [76@1x]=76 [76@2x]=152 [83.5@2x]=167 [1024@1x]=1024
)

for name in "${!IOS_SIZES[@]}"; do
  size=${IOS_SIZES[$name]}
  out="$IOS_OUT/Icon-App-${name}.png"
  magick -size ${size}x${size} xc:"$BG" \
    \( "$LOGO" -resize $((size*3/4))x$((size*3/4)) \) \
    -gravity center -composite "$out"
  echo "iOS $name: $out"
done

echo "\nAll icons generated in $ANDROID_OUT and $IOS_OUT. Copy them to your platform folders as needed." 