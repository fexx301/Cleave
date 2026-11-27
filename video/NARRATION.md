# Cleave demo narration

Voice: ElevenLabs "Mark - Strong, Premium and Polished" (8s7FhQuwCMptPvCeDnKj), eleven_v4, stability 0.5,
similarity 0.75. One generation per scene (the paragraphs between the two lines below), each sent with the
previous and next scene's text for continuity. Numbers are written as words. Every claim matches SPEC.md's
measured facts; if a recording shows a different value, change the line here and re-take that scene.

---

Elena's plan denied her urgent care visit for a missing referral. Somewhere in her plan's own rules is the clause that overturns it. Cleave finds it and drafts her appeal, without her letter ever leaving her device.

Gemini Nano reads the letter right here in Chrome. Nine personal details stay in a vault on her device. Zero network requests.

Only facts that don't name her can leave. And she decides. Without her plan ID, the cloud can only give general guidance. With it, Gemini, through Firebase AI Logic, finds the exact section of her plan: four point two A. The exception applies.

Her letter's reason, next to her plan's answer. The cloud writes the appeal with blanks, and her browser fills in her details, locally.

On a Medicare-style letter, checked against the real federal rule, Cleave didn't guess. It asked the one question the rule depends on: were you outside your plan's service area?

The same split runs natively on iPhone, with Apple's on-device models and the same Firebase AI Logic cloud step. Same choice, same answer.

Building it, we found a trap in the SDK. Handed a PDF, Firebase's prefer-on-device mode quietly sent the whole letter to the cloud, her name included. Cleave's only-on-device mode stopped on the device. Zero requests.

Every claim can be checked. Wire Proof shows exactly what crossed the wire: none of the member's personal details. In our synthetic benchmark, Cleave leaked zero of fifty planted identifiers. Manual redaction leaked eight.

Your details stay home. Your appeal goes out. Cleave.

---
