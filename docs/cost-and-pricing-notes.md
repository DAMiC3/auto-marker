# Cost & Pricing — Side Notes

> Captured from a planning discussion. This is a roadmap note, **not implemented yet**.
> The goal: keep AI marking cheap to run, and structure pricing so heavy users don't
> lose us money.

## Where the cost actually is

The marking pipeline has four steps. Only two of them cost money:

| Step | Runs where | API cost |
|------|-----------|----------|
| PDF → page image (rendering) | Browser (pdf.js) | **Free** |
| Stamping marks onto the PDF | Browser (pdf-lib) | **Free** |
| Sending page **images** to the AI | Cloud AI | **Highest cost** |
| AI reasoning + JSON output | Cloud AI | Smaller, pricier per token |

Key correction to an earlier assumption: **rendering and stamping are already free**
(they happen on the user's machine). The real cost is **how much image data we send to
the expensive vision model**.

Rough intuition: one page as an **image** ≈ ~1,000–2,000+ input tokens; the same page as
**plain text** ≈ a few hundred tokens. That's roughly a **10× difference**.

## Cost-reduction levers

1. **Text extraction for digital PDFs** — if a paper has a real text layer (typed work),
   extract text in the browser for free and send cheap text instead of images.
   - Limitation: scanned/handwritten papers have no text layer → must use vision/OCR.

2. **OCR-then-reason pipeline (the big one)** —
   - Cheap/free OCR (e.g. local **Tesseract**, or a cheap OCR API) converts each page
     image → **text + word bounding boxes**.
   - The expensive model (e.g. Claude) only ever sees **clean text** (cheap tokens) and
     does the marking judgment.
   - Bonus: OCR bounding boxes give **accurate mark placement** — better than asking a
     vision model to guess coordinates.
   - Catch: OCR quality on messy handwriting is imperfect.
   - Net effect: **cheap OCR (image→text+positions) → expensive model reasons on text →
     stamp marks at the OCR positions.**

3. **Smaller knobs** — render images at lower resolution (cheaper, but watch legibility);
   only send pages that actually contain answers.

## Provider options (switchable in Settings)

| Provider | Cost | Privacy | Setup | Quality |
|----------|------|---------|-------|---------|
| **Local / Ollama** | Free (their hardware) | Excellent — data never leaves their PC (good for POPIA) | Heavy: install + multi-GB model + `OLLAMA_ORIGINS` config | Weaker on handwriting |
| **Bring-your-own key** | They pay their provider | Depends on provider tier | Just a key | Depends on model |
| **We provide Claude** | We pay per token | Paid tiers don't train on data | None for user | Strongest |

Architecture note: a Netlify server **cannot** reach a user's `localhost`, so an
Ollama/local option requires the **browser** to call `localhost:11434` directly. Feasible
because rendering/stamping/file IO are already client-side.

## Pricing model (draft)

- **~R200 "Bring your own AI"** (Ollama or their own API key) — they cover compute, we
  charge for the software. Healthy margin, no variable-cost risk to us.
- **~R1000 "Done for you" (we provide Claude)** — ⚠️ risk: a flat fee while we pay
  per-token means a power user could burn **more than R1000 in tokens** and we lose money.
  Mitigate with one of:
  - a **fair-use cap** (e.g. X papers/month, then throttle or top-up), or
  - **per-paper metering** so price tracks usage.

Recommended shape: **R200 BYO-AI tier** + **R1000 done-for-you tier with a monthly
paper/page allowance** (overage billed or paused). Protects margin, stays simple for the
teacher.

## Privacy reminder (important)

Papers contain **student PII** (names, handwriting, answers). Under POPIA this is sensitive.
- Free cloud tiers often reserve the right to **train on your data** — bad for real student
  work.
- Prefer **Local/Ollama** (data stays on device) or **paid tiers with a no-training
  guarantee** for real student papers. Free tiers are fine for **testing/demos** only.

## Status

- ✅ Free rendering + stamping (already built)
- ✅ Free text extraction for digital PDFs (already built in `lib/markPaper.ts`)
- ⬜ OCR-then-reason pipeline
- ⬜ Provider switch (Local/Ollama · BYO key · Our Claude)
- ⬜ Metering / fair-use caps
