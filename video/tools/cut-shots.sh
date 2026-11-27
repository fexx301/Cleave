#!/usr/bin/env bash
# Cuts the film's shots from the raw takes in video/raw/ into film/assets/shots/ (1920x1080 or 1000 px tall, 30 fps CFR).
# Source times were picked by eye from contact sheets: ScreenCaptureKit drops unchanged frames, so take time != wall time.
# Every speed-up here is labelled on screen in the film with its real duration.
set -euo pipefail
cd "$(dirname "$0")/.."
R=raw
O=film/assets/shots
mkdir -p "$O"
# One fixed 16:9 crop: removes the tab strip, address bar and Chrome's agent-control indicators; keeps the workspace.
C="crop=2584:1454:220:384,scale=1920:1080:flags=lanczos,setsar=1"
ENC=(-c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -r 30 -an)
Q=(-v error -y)

# S1 hook: Elena's letter before the click.
ffmpeg "${Q[@]}" -ss 31 -i $R/r1-r4-case1.mov -frames:v 1 -vf "$C" $O/s1-letter.png

# S2 on-device split: 30.8-71 s at 4x (click at ~31.6 s; real step: 36.4 s), then hold on the vault.
ffmpeg "${Q[@]}" -ss 30.8 -to 71 -i $R/r1-r4-case1.mov \
  -vf "fps=30,$C,setpts=PTS/4,tpad=stop_mode=clone:stop_duration=2.2" "${ENC[@]}" $O/s2-split.mp4

# S3 the decision, timed to the narration, all at 1x (cloud waits cut):
# facts + uncheck (uncheck ~101.7 s) | general guidance | re-check (~136 s) + click Match (~140.2 s) | Section 4.2(a).
ffmpeg "${Q[@]}" -ss 98.3 -to 103.5 -i $R/r1-r4-case1.mov -ss 113 -to 116.8 -i $R/r1-r4-case1.mov \
  -ss 135 -to 140.5 -i $R/r1-r4-case1.mov -ss 143.3 -to 151.2 -i $R/r1-r4-case1.mov -filter_complex \
  "[0:v]fps=30,$C,setpts=PTS-STARTPTS[a];[1:v]fps=30,$C,setpts=PTS-STARTPTS[b];\
[2:v]fps=30,$C,setpts=PTS-STARTPTS[c];[3:v]fps=30,$C,setpts=PTS-STARTPTS[d];[a][b][c][d]concat=n=4:v=1:a=0[v]" \
  -map "[v]" "${ENC[@]}" $O/s3-decision.mp4

# S4 the side-by-side, then the filled-in draft.
ffmpeg "${Q[@]}" -ss 169 -to 174.5 -i $R/r1-r4-case1.mov -ss 188 -to 194 -i $R/r1-r4-case1.mov -filter_complex \
  "[0:v]fps=30,$C,setpts=PTS-STARTPTS[a];[1:v]fps=30,$C,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]" \
  -map "[v]" "${ENC[@]}" $O/s4-clause-draft.mp4

# S5 CMS-layout letter | result | the service-area question.
ffmpeg "${Q[@]}" -ss 24 -to 26.5 -i $R/r9-cms-letter.mov -ss 134 -to 140 -i $R/r9-cms-letter.mov \
  -ss 152.5 -to 158 -i $R/r9-cms-letter.mov -filter_complex \
  "[0:v]fps=30,$C,setpts=PTS-STARTPTS[a];[1:v]fps=30,$C,setpts=PTS-STARTPTS[b];[2:v]fps=30,$C,setpts=PTS-STARTPTS[c];\
[a][b][c]concat=n=3:v=1:a=0[v]" -map "[v]" "${ENC[@]}" $O/s5-question.mp4

# S6 iOS (vertical): split 4x | Plan ID off 2.5x | general guidance | Plan ID on 3x | result held.
I="scale=-2:1000:flags=lanczos,setsar=1"
ffmpeg "${Q[@]}" -ss 3 -to 11 -i $R/r10-ios.mov -ss 12 -to 19.5 -i $R/r10-ios.mov -ss 21 -to 24.5 -i $R/r10-ios.mov \
  -ss 27 -to 33.5 -i $R/r10-ios.mov -sseof -0.1 -i $R/r10-ios.mov -filter_complex \
  "[0:v]fps=30,$I,setpts=(PTS-STARTPTS)/4[a];[1:v]fps=30,$I,setpts=(PTS-STARTPTS)/2.5[b];[2:v]fps=30,$I,setpts=PTS-STARTPTS[c];\
[3:v]fps=30,$I,setpts=(PTS-STARTPTS)/3[d];[4:v]fps=30,$I,trim=end_frame=1,tpad=stop_mode=clone:stop_duration=3.5,setpts=PTS-STARTPTS[e];\
[a][b][c][d][e]concat=n=5:v=1:a=0[v]" -map "[v]" "${ENC[@]}" $O/s6-ios.mp4

# S6b Fail-Closed PDF Lab at 1x (first frame held 1 s): menu open | lab | Run (~16.9 s) | both results (18.5 s) | hold.
ffmpeg "${Q[@]}" -ss 12 -to 27.7 -i $R/r6-pdf-lab.mov -vf "fps=30,$C,setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=1" "${ENC[@]}" $O/s6b-pdf-lab.mp4

# S7 Wire Proof, then the finished eval table (held 1.5 s so the narration finishes over it).
ffmpeg "${Q[@]}" -ss 22 -to 29 -i $R/r7-r8-proof-eval.mov -ss 196 -to 203.5 -i $R/r7-r8-proof-eval.mov -filter_complex \
  "[0:v]fps=30,$C,setpts=PTS-STARTPTS[a];[1:v]fps=30,$C,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop_duration=1.5[v]" \
  -map "[v]" "${ENC[@]}" $O/s7-proof.mp4

for f in $O/*.mp4; do
  printf "%-22s %s\n" "$(basename "$f")" "$(ffprobe -v error -show_entries stream=width,height -show_entries format=duration -of csv=p=0:s=x "$f" | tr '\n' ' ')"
done
