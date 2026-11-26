# SPEC: Cleave demo film (storyline A "One letter, two sides" + C's real-world question)

GOAL:    A judge finishes thinking "her personal details never left the device, and it still found the plan
         section that overturns the denial, and it was honest when the rule needed a fact it didn't have."
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps. Delivery: MP4 for Devpost/YouTube.
TIME:    ~170 s x 30 = ~5,100 frames (target 2:40-2:55; confirm Devpost's limit). Music bed ~84 BPM
         (one beat = 21.4 frames); cuts land on beats, not on every beat.
VOICE:   ElevenLabs "Mark - Strong, Premium and Polished", voice_id 8s7FhQuwCMptPvCeDnKj, model eleven_v4,
         stability 0.5, similarity 0.75 (same as allot and velum). Generated per segment with the ElevenLabs
         CLI (@elevenlabs/cli, as in allot) with previous/next-text stitching; numbers written as words.
         Key: ELEVENLABS_API_KEY from velum-video/.env.local (never copied into this repo). Uses your
         ElevenLabs credits: about 2,600 characters per full take.

## Faithfulness (Devpost: "must function as depicted in the video")

- Every product shot is a real screen recording of Cleave, from your own Chrome profile (the only one with
  Gemini Nano). No rebuilt or mocked UI. A punch-in rebuilds nothing; it scales the recording.
- Every wait that is sped up carries a caption with its real duration: "4x · on-device step took 36 s".
- Sample letters carry a persistent caption: "Sample letter · fictional member". The CMS-layout letter adds
  "Layout per CMS-10003 · rule text from 42 CFR 422.113".
- Every number on screen or in the voice comes from a measured run (below) and is re-checked against the
  recordings before render. If a recording shows a different number, the recording wins and the script changes.

Measured facts (source run in brackets):
- Case 1 on-device: 9 personal details kept, 0 network requests, 12-43 s [live + localhost runs, 25-26 Nov].
- Case 1 facts: missing referral, out of network, after-hours urgent care, 19 days since visit, 11 since notice.
- Case 1 request: 354 bytes; 323 with Plan ID unchecked [Replay + live].
- Case 1 cloud: Section 4.2(a) / 8.2, "Exception applies", 0 of your personal details in 7,654 bytes, 5.6 s [live site].
- Case 3: "Exception possible — needs your confirmation"; ticking swaps in "My ordering physician documented
  clinical urgency in my medical chart." [live].
- Fail-Closed Lab: ONLY_ON_DEVICE "HTTP Requests: 0"; PREFER_ON_DEVICE "HTTP Requests: 1 · Raw PDF on Wire: true" [localhost].
- Eval: Cleave 6/6 exact, 0/50 leaks; manual redaction 3/6, 8/50 leaks; 6/6 completed, 0 false refusals [26 Nov].
- CMS-layout letter vs 42 CFR 422.113: "Matched your plan · Section 422.113(b)(1)(iii)", "Exception possible —
  needs your confirmation", question "Were you temporarily outside the plan's service area, or was the plan's
  network temporarily unavailable or inaccessible…", 60-day deadline cited [localhost, 26 Nov].

## LOOK

The medium is Cleave itself: its paper-and-ink editorial UI. The app's own look (off-white ground, Newsreader
serif, JetBrains Mono labels, pill tags) is used exactly as the app uses it and nowhere else.
- Ground: #f7f6f3 (app canvas), 0% grain. Surfaces: #ffffff cards, 1 px #eaeaea borders, 6 px radius.
- Ink: #111111 for read text, #787774 for secondary. Captions: #111111 on #ffffff at 92% opacity, 8 px radius.
- Two territory colours, never mixed: device = green #346538 on #edf3ec; cloud = blue #1f6c9f on #e1f3fe.
- Accent (rationed): the logo gradient #246B4D → #247772 → #327DB3, only on the seam line and the end card.
- Alarm: red #9f2f2d only in the tension beat (the leaked PDF). Question: yellow #956400 on #fbf3db only in the
  real-world beat.
- Type: display Newsreader 500, 84 px, -2% tracking (titles, max 6 words, one line at a time); captions SF
  Pro/Helvetica Neue 500, 44 px; labels JetBrains Mono 30 px. Nothing smaller than 28 px after any push.
  (Newsreader and JetBrains Mono need @font-face files in assets/fonts/; check format.md's bundled list.)
- Depth: product windows sit on the ground with a 0 18 px 40 px rgba(17,17,17,0.10) shadow. No vignette, no grain.

## OBJECTS

- The letter: Cleave's real letter pane, monospace text with green highlight marks landing on identifiers.
- The vault: the app's "Personal details kept on this device" card; items arrive one by one.
- The seam: the app's dashed centre line with the scissors badge. It becomes a full-height line in split shots.
- Fact chips: the app's allowlist rows (label left, plain-English value right), crossing the seam.
- The wire: the Wire Proof window and, if recorded, Chrome DevTools' Network panel.
- The split-C mark (public/cleave-logo.svg), the brand's own file, never redrawn.

## MOTION

- Enter/move: the app's own ease, cubic-bezier(0.23, 1, 0.32, 1). Camera pushes 15-18 frames with motion blur,
  then hold while the UI acts. Exits: 10 frames, ease-in.
- The cleave move: the letter frame splits along the seam in 24 frames; left half settles 40 px left, right
  half 40 px right; personal details slide left into the vault (stagger 4 frames), fact chips slide right.
- Cursor: system cursor scaled to ~5% of frame height, its click causes the next change on the same frame.
- Transitions (4 kinds, each with a cause): split along the seam; push into a control; a chip crossing the
  seam becomes the next shot; pull back into the full window.

## SHOTS (narration lines are the voice; ~150 wpm)

S1 Hook 0:00-0:12. Real letter fills frame, highlights land on name, member ID, claim number (R1, start).
  VO: "Here's a health plan's denial letter. Elena's urgent care visit wasn't covered, and the letter is full
  of her details: her name, her member number, her claim number." Caption: Sample letter · fictional member.
  Hands off: the letter shrinks into a cloud upload.
S2 Tension 0:12-0:30. Fail-Closed Lab recording (R6): PREFER_ON_DEVICE card turns red, "Raw PDF on Wire: true".
  VO: "To understand a letter like this, most people paste the whole thing into an AI in the cloud. Even
  'prefer on-device' modes can quietly do it: in our lab, Chrome sent the entire PDF." Hands off: red card
  wipes away along the seam.
S3 Reveal 0:30-0:40. Title on ground: "Split the secret from the math", then the app window slides in.
  VO: "Cleave splits the secret from the math."
S4 Cleave on device 0:40-1:05. R1 full: click "Cleave Letter on Device", 1/2 → 2/2 progress, vault fills.
  Caption: "4x · on-device step took 36 s". Punch-in on "0 network requests".
  VO: "Gemini Nano reads the letter right here in Chrome, on this device. Nine personal details go into a
  local vault, and nothing is sent: zero network requests."
S5 Choose what leaves 1:05-1:20. R2: allowlist rows; uncheck Plan ID, privacy check 354 → 323 bytes; re-check.
  VO: "What's left is a short list of facts that don't identify her: a missing referral, out of network,
  after hours, nineteen days ago. She can hold any of them back, and code checks every byte before it leaves."
S6 Cloud match 1:20-1:40. R3: click Match, result card lands: "Matched your plan · Section 4.2(a)",
  "Exception applies", the quoted clause. Chip crossing the seam opens this shot.
  VO: "Only those facts go to Gemini in the cloud, through Firebase AI Logic. In about six seconds it finds
  the section of her plan that waives the referral: four point two A. The exception applies."
S7 Draft 1:40-1:55. R4: draft card, "7 details filled in on this device"; then R5 (Case 3) tick → sentence swaps.
  VO: "The cloud writes her appeal with blanks, and her browser fills in her details locally. When a fact
  is uncertain, Cleave asks instead of guessing."
S8 Real-world question 1:55-2:17. R9: CMS-layout letter, federal rule document, result "Exception possible —
  needs your confirmation", yellow question card pushes in. Captions: Layout per CMS-10003 · fictional member;
  rule text from 42 CFR 422.113.
  VO: "We also tried a Medicare-style denial, laid out like the official form, against the real federal rule.
  Cleave didn't promise a win. It asked the one question the rule depends on: were you outside your plan's
  service area?"
S9 Payoff 2:17-2:37. R7 Wire Proof green banner + request body (no name, no member ID); R8 eval table;
  numbers land: 0/50 vs 8/50, 6/6 vs 3/6. (Optional R11 DevTools empty Network panel.)
  VO: "And every claim can be checked. Wire Proof shows exactly what crossed the wire: none of her personal
  details. Across six test cases, Cleave leaked zero of fifty planted identifiers. Manual redaction leaked eight."
S10 Claim + end card 2:37-2:52. Title "Your details stay home." then "Your appeal goes out." Mark cleaves in
  (green half and blue half join), wordmark wipes in, URL cleave-5a82b.web.app, "Built with Firebase AI Logic".
  Hold 2.5 s.
  VO: "Your details stay home. Your appeal goes out. Cleave."
  (iPhone line only if R10 is recorded working end to end: "…on the web, and on iPhone.")

## RECORDINGS NEEDED (real, your Chrome profile with Nano, window 1920 x 1080, 100% zoom, no other tabs)

R1 Case 1: letter view, click Cleave, full on-device run to vault (keep the real wait; it's sped up in edit).
R2 Case 1 allowlist: uncheck and re-check Plan Policy Identifier, privacy-check bytes visible.
R3 Case 1: Match Policy Clause in Cloud → result card (scroll-to-result included).
R4 Case 1: draft card, slow scroll through the filled-in draft.
R5 Case 3: result + tick the confirmation box → draft sentence swaps.
R6 Proof → Fail-Closed PDF Lab → Run Live PDF Comparison → both cards.
R7 Proof → Wire Proof: green banner, trail, open the production request body.
R8 Proof → 6-Case Benchmark → run to the finished table (about 3-4 min real; shown sped up and captioned).
R9 CMS-layout test letter (video/test-data/cms-style-letter.txt) + rule text (video/test-data/42cfr-422-excerpt.txt) → match → question card.
R10 (optional) iOS app on an Apple Intelligence iPhone, end to end.
R11 (optional) Chrome DevTools Network panel open beside the app during R1, showing no requests.

## SOUND

Mark narration on top; music bed 84 BPM, low, ducked 10 dB under voice; a dry paper "cleave" on each item
locking into the vault; a soft tick when a fact crosses the seam; one low buzz on the red PDF leak; silence
for 0.5 s before the service-area question.

## BANNED

Defaults from spec.md; the app's editorial look anywhere the app doesn't use it; any invented or rebuilt UI;
uncaptioned speed-ups; rounded-up numbers; "seamless", "unlock", "in seconds"; three cards in a row; a title
over a dimmed screenshot; the logo docked in a corner; DevTools without a label saying what it shows.

## QA (frames to check)

- 0:00 frame 0: the letter with at least one highlight visible (never black, never a logo).
- S4 speed caption visible during every sped-up frame; "0 network requests" legible after the push.
- S5 both byte values legible (354 and 323).
- S6 "Section 4.2(a)" and "Exception applies" held at least 2 s.
- S8 fictional-member and CMS/42 CFR captions present the whole beat.
- S9 every number matches its recording.
- End card: mark centred, 15-30% of width, URL held at least 2 s.
