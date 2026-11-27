# SPEC: Cleave demo film (merged: A's one-letter spine, Astra's Plan ID decision as the centrepiece, C's real-world question, iOS)

GOAL:    A judge finishes thinking "her personal details never left the device, and it still found the plan
         section that overturns the denial, and it was honest when the rule needed a fact it didn't have."
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps. Delivery: MP4 for Devpost/YouTube.
TIME:    109 s x 30 = 3,270 frames (cut 1; length follows the 86.8 s narration; confirm Devpost's limit). Music bed ~84 BPM
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
- Eval: Cleave 6/6 exact, 0/50 leaks; manual redaction 3/6 [26 Nov] and 4/6 [27 Nov, on camera], 8/50 leaks both runs; 6/6 completed, 0 false refusals.
- Case 1 Plan ID withheld (web): "General guidance · no plan section", "Can't tell without your plan" [live, 25-26 Nov].
- iOS Simulator self-test, Apple on-device models [27 Nov]: Case 1 on-device 9 details, 3.4 s; cloud 4.2(a) YES,
  4,492 bytes, 2.3 s, 0 leaks, 7 details filled in; Plan ID withheld -> GENERAL_GUIDANCE_ONLY, clause NONE,
  UNKNOWN_NO_POLICY; Case 3 5.1(c) CONDITIONAL with 1 confirmation item, clean swap.
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

## SHOTS (narration lines are the voice; ~150 wpm). Centrepiece: S3, the patient's Plan ID decision.

S1 Hook 0:00-0:20. Elena's real letter (R1 start); punch-in on "Reason Code: REF-01 (Missing Primary Care
  Physician Referral)". Her question appears as a title over the letter, framed as hers, not as app UI:
  "My plan has an after-hours exception. Does it apply here?" Caption: Sample letter · fictional member.
  VO: "Elena's plan denied her urgent care visit for a missing referral. Her plan has an after-hours
  exception. But to find out if it applies, does she have to hand her whole letter to the cloud?"
S2 On-device split 0:20-0:40. R1: click "Cleave Letter on Device", progress 1/2 → 2/2, highlights land, vault
  fills. Overlay: each highlighted detail lifts from the letter and drops into the vault on the device side;
  the letter stays visible on the left. Caption: "4x · on-device step took 36 s". Push-in: "0 network requests".
  VO: "No. Gemini Nano reads the letter right here in Chrome. Nine personal details stay in a vault on her
  device. Zero network requests."
S3 The decision 0:40-1:05 (centrepiece). R2: the fact list; she unchecks Plan Policy Identifier → "Get General
  Guidance in Cloud" → "General guidance · no plan section", "Can't tell without your plan". She re-checks it →
  "Match Policy Clause in Cloud" → "Matched your plan · Section 4.2(a)", "Exception applies". Overlay follows
  the exact fields crossing the seam; the Plan ID chip waits on the device side the first time, crosses the
  second. Hold the two answers long enough to compare (at least 2 s each).
  VO: "Only facts that don't name her can leave. And she decides. Without her plan ID, the cloud can only
  give general guidance. With it, Gemini, through Firebase AI Logic, finds the exact section of her plan:
  four point two A. The exception applies."
S4 Clause meets letter, draft comes home 1:05-1:20. R3: the app's own side-by-side, "Insurer's Denial
  Sentence" next to "What Your Plan Says (Section 4.2(a))"; then R4: draft, "7 details filled in on this
  device", slow scroll.
  VO: "Her letter's reason, next to her plan's answer. The cloud writes the appeal with blanks, and her
  browser fills in her details, locally."
S5 The unresolved fact 1:20-1:40. R9: the CMS-layout letter with the real federal rule as her plan document;
  result "Exception possible — needs your confirmation"; push in on the question. Captions: Layout per
  CMS-10003 · fictional member; rule text from 42 CFR 422.113. 0.5 s silence before the question.
  VO: "On a Medicare-style letter, checked against the real federal rule, Cleave didn't guess. It asked the
  one question the rule depends on: were you outside your plan's service area?"
S6 Same decision on iPhone 1:40-2:05. R10 (label: "iOS Simulator · Apple on-device models"): Case 1 split on
  device; Plan ID withheld → general guidance; shared → Section 4.2(a), Exception applies.
  VO: "The same split runs natively on iPhone, with Apple's on-device models and the same Firebase AI Logic
  cloud step. Same choice, same answer."
S7 Evidence 2:05-2:30. R7: Wire Proof, green banner, the request body (no name, no member ID). R8: eval table,
  captioned "Synthetic benchmark: 6 test cases, 50 planted identifiers". Numbers land: 0/50 vs 8/50.
  VO: "Every claim can be checked. Wire Proof shows exactly what crossed the wire: none of the member's personal details. In our synthetic benchmark, Cleave leaked zero of fifty planted identifiers. Manual redaction
  leaked eight."
S8 Claim + end card 2:30-2:42. Title "Your details stay home." then "Your appeal goes out." Mark cleaves in
  (green half and blue half join), wordmark wipes in, URL cleave-5a82b.web.app, "Built with Firebase AI
  Logic · Web and iOS". Hold 2.5 s.
  VO: "Your details stay home. Your appeal goes out. Cleave."

## RECORDINGS NEEDED (real; web in your Chrome profile with Nano, window 1920 x 1080, 100% zoom, no other tabs)

Before recording: clear this browser's saved answers (localStorage key "cleave-cloud-cache-v1"), or the
re-run in S3 shows "Saved answer reused" instead of a live call. Record on the live site.
R1 Case 1: letter view, click Cleave on Device, full on-device run to vault (real wait kept; sped up in edit).
R2 Case 1 decision: uncheck Plan Policy Identifier → Get General Guidance (result) → re-check → Match Policy
   Clause in Cloud (result). One continuous take.
R3 Case 1 result: the side-by-side denial sentence and plan text (continues from R2).
R4 Case 1 draft: slow scroll through the filled-in draft.
R6 (optional) Proof → Fail-Closed PDF Lab → Run Live PDF Comparison.
R7 Proof → Wire Proof: green banner, trail, open the production request body.
R8 Proof → 6-Case Benchmark → run to the finished table (~3-4 min real; sped up and captioned).
R9 CMS-layout letter (video/test-data/cms-style-letter.txt) + rule text (video/test-data/42cfr-422-excerpt.txt)
   as "Bring your own plan" → match → question card.
R10 iOS Simulator screen recording (xcrun simctl io recordVideo) of the same flow; the self-test
   (CLEAVE_IOS_SELFTEST=1) drives it: Case 1 split → match → Plan ID withheld → general guidance.
R11 (optional) Chrome DevTools Network panel beside the app during R1, showing no requests.

## SOUND

Mark narration on top; music bed 84 BPM, low, ducked 10 dB under voice; a dry paper "cleave" on each item
locking into the vault; a soft tick when a fact crosses the seam (and none when the Plan ID is held back); silence
for 0.5 s before the service-area question.

## BANNED

Defaults from spec.md; the app's editorial look anywhere the app doesn't use it; any invented or rebuilt UI;
uncaptioned speed-ups; rounded-up numbers; "seamless", "unlock", "in seconds"; three cards in a row; a title
over a dimmed screenshot; the logo docked in a corner; DevTools without a label saying what it shows.

## QA (frames to check)

- 0:00 frame 0: the letter with at least one highlight visible (never black, never a logo).
- S4 speed caption visible during every sped-up frame; "0 network requests" legible after the push.
- S3 both answers (general guidance; Section 4.2(a) + Exception applies) held at least 2 s each.
- S5 fictional-member and CMS/42 CFR captions present the whole beat.
- S6 "iOS Simulator" label present the whole beat.
- S7 "Synthetic benchmark" caption present; every number matches its recording.
- End card: mark centred, 15-30% of width, URL held at least 2 s.
