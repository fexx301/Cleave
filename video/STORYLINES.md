# Cleave demo video: three storylines

For #BuildHybridAI 2026 (Devpost). Judged on Technological Implementation, Design, Potential Impact, Quality of the Idea (equal weight). Rule: the project "must function as depicted in the video".

**The one thing:** Cleave reads your denial letter on your device and sends the cloud only facts that don't identify you, so you can appeal without uploading the letter.
**What the viewer should remember:** "My personal details never left my computer, and I still got the plan section that overturns the denial."
**The spine:** Elena Vasquez's after-hours urgent-care denial (Case 1) travels from the letter to the appeal draft.

**Real facts the film may use (all measured in this project):**
- On-device split: 0 network requests (Wire Proof), 10–43 s on Nano.
- Cloud match: 5.6 s live, Section 4.2(a), "Exception applies", 0 personal details in 7,654 bytes.
- 6-case eval: Cleave 6/6 exact, 0/50 leaks; manual redaction 3/6, 8/50 leaks.
- Fail-Closed Lab: PREFER_ON_DEVICE sends the raw PDF as Base64 ("Raw PDF on wire: true"); ONLY_ON_DEVICE sends 0 requests.
- Case 3: "Exception possible, needs your confirmation", then the confirmed sentence swaps into the draft.
- Real-format test: a CMS-10003-layout letter (fictional member, labelled) against the real federal rule 42 CFR 422.113 returns "possible, needs confirmation" and asks the one deciding question (outside the service area?).

**Faithfulness rules for every storyline:** real recorded UI only. Any sped-up wait is captioned with its real duration ("4× · on-device step took 36 s"). Fictional letters are labelled "test data". Numbers are copied from the runs above, never rounded up.

---

## A. One letter, two sides (recommended)

Recommended because it walks the judges through all four criteria on one real case, and its central picture (the letter splitting) is the product's name.

- **Device and form:** one object across a split, "split screen to one". The screen is divided like the app: left is the device (personal details lock into the vault), right is the cloud (only fact chips cross the seam). Each beat pulls back into the real Cleave UI, so the split is always seen happening in the product.
- **First 2 seconds:** Elena's real denial letter fills the frame. "DETERMINATION: DENIED" and her name, member ID and claim number glow as Cleave's on-device highlights land on them, one by one.
- **Beats:** hook (letter, highlights land) → tension (the usual way: the whole letter goes to a cloud AI; real Fail-Closed Lab result "Raw PDF on wire: true") → reveal ("Cleave: split the secret from the math") → proof: *open the letter* · *cleave on device* (0 requests, captioned speed-up) · *choose what leaves* (uncheck a fact, request size changes) · *match the plan in the cloud* (Section 4.2(a), Exception applies) · *confirm and draft* (Case 3 swap) → payoff (Wire Proof turns green: 0 personal details on the wire; eval 0/50 vs 8/50 lands) → claim ("Your details stay home. Your appeal goes out.") → end card (split-C mark cleaves in, URL, "Built with Firebase AI Logic").
- **Look:** Cleave's own light editorial UI as home; the device side keeps the app's green, the cloud side its blue; the seam (the app's scissors seam) is the one recurring object.
- **Sound:** your local narrator voice, a soft pulse bed, a dry paper "cleave" sound each time a detail locks into the vault, a light chime when a fact crosses the seam.

## B. Watch the wire

- **Device and form:** the result first, as one continuous take with DevTools open. The real Network panel runs beside Cleave the whole time, so the proof is the empty list while the letter is read.
- **First 2 seconds:** a real Chrome Network panel, recording, and empty, while Cleave reads Elena's letter on the left. Caption: "0 requests."
- **Beats:** hook (empty Network panel) → tension (switch the mode to PREFER_ON_DEVICE in the Fail-Closed Lab; a red request appears carrying the raw PDF) → reveal (Cleave's ONLY_ON_DEVICE, the panel stays empty) → proof (the one cloud request appears; zoom into its body: only fact codes, no name, no member ID) → payoff (Wire Proof's green banner and the eval scoreboard) → claim → end card.
- **Look:** real DevTools beside the real app, no added ground; one red request is the only alarm colour.
- **Sound:** sparse; a tick per network request and silence where there are none, so the sound itself proves the point.

## C. The question that decides it (bold)

- **Device and form:** a moment in someone's day, as an object-to-object chain. An official-layout Medicare denial lands; every shot ends on the thing that opens the next (envelope → letter → highlighted fields → fact chips → federal rule text → the one question → the draft).
- **First 2 seconds:** a Medicare denial notice in the official CMS layout (labelled "test data: fictional member") slides out of an envelope; "Why did we deny your request?" fills the frame.
- **Beats:** hook (the notice) → tension (a generic AI promises "you'll win", shown as a plain on-screen line, no named product) → reveal (Cleave splits the letter on device) → proof (fact chips cross; the real federal rule 42 CFR 422.113 is matched) → payoff (instead of guessing, Cleave asks the one question the rule turns on: "Were you outside your plan's service area?") → claim ("It won't invent your case.") → end card.
- **Look:** paper and ink for the letter world; the real app for every product shot; one highlighter yellow for the deciding question.
- **Sound:** narrator, paper sounds, a held silence before the question.

---

**Assumptions (any of them can change):** 2:30–3:00 long (typical Devpost limit; confirm on the Devpost page), 16:9 at 1920×1080 and 30 fps, narrated with your local Qwen3-TTS narrator (free; a HeyGen voice is a paid alternative), free or local music, no avatar. Recordings are made in your own Chrome profile, because Gemini Nano is only installed there.
