# Review: Cleave demo film, cut 4 (2:07)

Cut 4 leads with what sets Cleave apart (matching README "What sets Cleave apart"): the opening line is now the job
("…the clause that overturns it. Cleave finds it and drafts her appeal, without her letter ever leaving her device"),
scene 2 drops its "No." answer, and the PDF Lab beat opens "Building it, we found a trap in the SDK" (vo/take-4).
S1 and S6b each grew 1.5 s; the S6b shot holds its first frame 1 s so the leak result still lands on the line.

## Cut 3 notes

Cut 3 adds the Fail-Closed PDF Lab beat (85.4-100.6 s): a live run on the hosted site, recorded at 1x, the same
fictional letter as a PDF. PREFER_ON_DEVICE sent the raw Base64 PDF (decoded name, member ID, claim number);
ONLY_ON_DEVICE threw locally with 0 HTTP requests. One new Mark line (vo/take-3/s7). Also fixes the framing found
in review: S5 push-in 1.15x centred (nothing clipped), S1/S3/S7 labels moved off the UI.

## Cut 2 notes

Cut 2 adds: music bed (your LoFi_hold_music.mp3, looped once, ~-13 dB under the voice), 16 synthesised
effects (ticks, clicks, paper), a cursor on the real click targets, highlights landing on the letter's real
identifiers in the first 1.5 s, a device -> cloud strip in S3 (facts cross; the Plan ID is held back, then
crosses), S3 re-cut to the narration at 1x, a performed end card (the mark's halves join), a tighter S5 zoom.

## Cut 1 notes

## Creative calls
- Storyline: A's one-letter spine with Astra's Plan ID decision as the centrepiece (0:24–0:47), C's federal-rule
  question as the real-world beat, and the iOS Simulator beat. Not built: B "Watch the wire" (kept as the S7 proof beat).
- Length follows the narration (86.8 s of Mark's voice): 1:49, not the 2:40 first planned; nothing padded.
- Every product shot is a real recording (live site in your Chrome; iOS Simulator). Overlays only add captions,
  punch-ins and the hook's quoted question. No rebuilt UI.
- One fixed 16:9 crop on all web footage removes your tab strip, the address bar and Chrome's agent-control
  indicators (debug bar, "Claude is working here" badge, orange edge glow); it also drops Cleave's top header.
- Speed-ups are labelled on screen: S2 "4× · on-device step took 36.4 s", S3 "1.3–1.5× · cloud waits cut",
  S6 "iOS Simulator · waits sped up 2.5–4×". Cloud waits in S3 are cut, not sped.
- S7 pushes in on the eval's own leak boxes (0/50 vs 8/50) instead of an overlay card that covered the table.

## Measured vs looked at
- `hyperframes check`: 0 errors. Lint warnings kept: 4× `timeline_track_too_dense` (scene files with 4–7 timed
  captions; advisory). S1's question card carries `data-hold` (deliberate 4 s read while the voice asks it).
- Looked at: full contact sheets, the fixed moments, the review sheets (beats, phone width, cut seams).
- Not checked: the sound was not heard. Narration placement is by measured clip lengths only; listen for the gap
  before each scene and the scene 7 → 8 handoff.

## Weakest shot
- S5 (federal-rule question): busy frame, small body text; the zoom helps but the question line is still the
  smallest text in the film. With more time: a second, tighter push on the checkbox line.

## Open items
- Sound not heard: levels set by measurement only (voice -16 LUFS, bed ~-30 LUFS). Listen to the mix and the
  music crossfades at 0:58-1:00 and 1:56-1:58, and the cut at the start of line 2 ("No." trimmed).
- Kept warning: duplicate_media_discovery_risk (three crops of one logo on the end card).
- Numbers on screen match the recordings: 36.4 s, 9 details, Section 4.2(a), 422.113(b)(1)(iii), 0/50 vs 8/50,
  manual 4/6 (this run). The narration only cites the leak numbers.
