# Category 2 — Marking & PDFs

**Status:** ✅ Fully documented · **Last verified against code:** 2026-06-12
**Owner:** Michael Bernard

This is the product engine: turn a folder of student PDFs + a memo into marked PDFs with ticks, scores, and notes stamped on. This category owns the **pipeline mechanics**. Category 1 governs whether a run is *allowed*; Category 5 owns *what we ask the model*; this owns *how a PDF becomes a marked PDF*.

---

## 1. The pipeline in one paragraph

For each paper: the **browser** opens the PDF with `pdf.js`, extracts each page as either cheap **text + y-position hints** (typed pages) or a **rendered PNG image** (scans/diagrams), skipping blank pages. That per-page content + the memo is POSTed to a **server route** (`/api/mark` instant, or `/api/mark/batch`), which calls Claude and returns JSON annotations (page, y, shape, marks, comment). Back in the **browser**, `pdf-lib` **stamps** those annotations onto the original PDF bytes — shapes and scores in the right margin, marker's notes + overall summary at the bottom — writes the result as `"<name> (marked).pdf"` into the destination folder, and removes the original from the source folder.

**Architectural fact that shapes everything:** *all PDF work happens client-side.* The only server step is the Claude call. pdf.js (extract/render) and pdf-lib (stamp) run in the user's browser. Consequences: memory-bound per device, **Chrome/Edge only** (File System Access API), and the server never holds student PDFs (a POPIA plus).

---

## 2. Data shapes (the contract between stages)

From `lib/markingPrompt.ts` (shared client+server so the routes can't drift):

```ts
// A page is cheap text OR a fallback image.
type PageContent =
  | { kind: "text"; text: string }     // lines prefixed "[y=0.NN] …"
  | { kind: "image"; data: string };   // base64 PNG (no data: prefix)

interface Annotation {                  // one mark placed on the page
  page: number;    // 1-based
  y: number;       // 0 (top) .. 1 (bottom)
  shape: string;   // "tick" | "half" | "cross" | "circle" | "underline" | "dot"
  marks: string;   // "n/m", e.g. "3/5"
  comment: string;
}

interface MarkResponse { total; available; percentage; annotations: Annotation[]; summary }
```

`lib/markPaper.ts` adds:
```ts
interface PreparedPaper { original: Uint8Array; pages: PageContent[] }
interface MarkOutcome   { bytes: Uint8Array; total; available; percentage; summary }
```

---

## 3. Stage 1 — Ingestion & extraction (`lib/markPaper.ts`)

### 3.1 `preparePaper(file): PreparedPaper`

The heart of the cost strategy. Loads the PDF with `pdf.js`, then **per page**:

1. **Get the text layer** (`page.getTextContent()`), keeping only items with non-empty `str` and a `transform`.
2. **If text items exist → emit a `text` page:**
   - Each item's normalized vertical position is `y = 1 − transform[5] / pageHeight` (0 = top).
   - Items are **grouped into lines** when their `y` is within `0.012` of an existing line, then lines sorted top→bottom, parts within a line sorted left→right by `x`.
   - Output is one string, one line each: `"[y=0.30] the answer text here"`. Those `[y=…]` hints are what let Claude place a mark next to the right answer.
3. **If no text layer → it's a scan/diagram:**
   - Render the page to a canvas at **scale 1.6**.
   - **Blank check** (`isCanvasBlank`): samples ~1 pixel in every 16; if **< 0.2%** of sampled pixels carry ink, the page is treated as blank and **skipped entirely** (no tokens spent).
   - Otherwise emit an `image` page: `canvas.toDataURL("image/png")` (base64 stripped of the `data:` prefix).

> **Why text-first:** text tokens are ~10× cheaper than image (vision) tokens, and `[y=…]` hints give far more accurate mark placement than asking the model to eyeball an image. Image is the fallback, not the default.

### 3.2 `extractMemoText(file): string`

Best-effort answer-key text. `.txt` → raw text; `.pdf` → concatenated `pdf.js` text layer; anything else → `""`. No OCR — a scanned memo yields empty text (a known gap).

---

## 4. Stage 2 — The marking call (server)

`preparePaper` output is sent to the server, which is the only place an API key exists. Two routes (both also **Category 1 enforcement points** — see that doc for the allowance gates):

| | Instant `/api/mark` | Batch `/api/mark/batch` |
|---|---|---|
| Shape | one paper per request | all papers in one `batches.create` |
| Cost | full price | ~50% cheaper (Anthropic Batch API) |
| Latency | seconds | minutes; client polls |
| Tab | can be quick | **must stay open** while polling |

**Prompt construction** (`lib/markingPrompt.ts`, shared by both routes):
- `buildSystem(strictness, markTypes, subject)` — the marker instructions: memo is the only source of truth, reward correctness not style, partial credit per memo point, **strictness `${n}/10`**, hard "DO NOT HALLUCINATE" rules, and the **short-key output contract** (`p, y, s, m, c`) to save tokens. Returned as a **cached** (`cache_control: ephemeral`) text block.
- `buildContent(memoText, pages)` — a **cached** `MEMO (answer key): …` block, then one block per page (`--- Page N ---\n[y=…] …` for text, an `image` block for scans), then a trailing "return only the JSON" instruction.
- `parseMarkResponse(raw)` — robust: prefers a fenced ` ```json ` block, else slices first `{` to last `}` (tolerates prose around the JSON), then **expands the short keys** `p,y,s,m,c` back into the full `Annotation`. Throws if no JSON object is found.

> ⚠️ **`mockResult()` exists but is unused.** `lib/markingPrompt.ts` has a `mockResult()` for "no API key" demos, but both routes instead return **503** when the key is missing (deliberate — never stamp fake marks). If you ever want a no-key demo mode, that's the hook; today it's dead code.

---

## 5. Stage 3 — Stamping (`stampPaper`, client)

Takes the **original PDF bytes** + the annotations and draws onto them with `pdf-lib` (font: Helvetica-Bold).

- **Per annotation:** resolve colour from the matching mark-type's hex (`hexToRgb`) or default red `rgb(0.86,0.15,0.15)`. Convert `y`→PDF coords: `pdfY = height * (1 − clamp(ann.y, 0, 1))`. Draw the **shape** at `x = width − 42` and the **score text** (`ann.marks`) at `x = width − 32` — both in the **far-right margin**, clear of the answer text.
- **Shapes** (`drawShape`): `tick`, `half` (tick + slash), `cross`, `circle`, `underline`, `dot`. Vector-drawn from line/ellipse primitives.
- **Comments are NOT placed inline** — the margin is too narrow. They're collected and printed at the **bottom of the last page** under "Marker's notes:", wrapped to width (`wrapText`).
- **Total badge:** a red-bordered box top-right of **page 1** reading `Total: {total} / {available}`.
- **Overall summary:** Claude's 2–3 sentence `summary` printed at the bottom of the last page under "Overall:".
- Returns new `Uint8Array` via `pdfDoc.save()`.

---

## 6. Orchestration (`app/page.tsx`)

The single-page app wires the whole flow. State lives here; storage is browser-local.

**Setup the user does once:** click **Connect your files** → `showDirectoryPicker` (a real folder on disk). Subfolders become "classes." The chosen root handle is persisted in IndexedDB (`automark-fs`) and silently reconnected on next visit if permission survives.

**Per run:** pick a **From** folder and a **To** folder (must differ), choose a **memo** from the archive (or "no memo"), set **subject** + **strictness**, pick **Instant** or **Batch**, hit **Mark**. `canMark` requires From ≠ To, files present, not busy.

### 6.1 `runInstant(from, to)`
Sequential loop over files. For each PDF: `markInstant()` (prepare → POST `/api/mark` → stamp) → `writeFile(to, "<name> (marked).pdf", bytes)` → `removeEntry` from `from`. Non-PDFs are just **moved** (counted as `moved`, not marked).

### 6.2 `runBatch(from, to)`
1. Split PDFs vs others; **move** the non-PDFs.
2. **Prepare all PDFs client-side** (`preparePaper` each, with progress).
3. POST all to `/api/mark/batch` → get `batchId`.
4. `pollBatch(batchId)`: GET every **5 s**, up to **240 attempts (~20 min)**, until `status === "ended"`; throws a "taking longer than expected" message past that.
5. For each result: `stampPaper` → write `"(marked).pdf"` → remove original. Per-paper failures are recorded but don't kill the batch.

### 6.3 Output naming & side effects
- Marked file: `"<original name without .pdf> (marked).pdf"`, run through `uniqueName()` so a name collision is **versioned** (`"… (marked) (2).pdf"`) instead of overwriting (P2-1).
- The original is **deleted from From** after a successful write — **unless** the `keepOriginals` setting ("Keep for marking") is on, in which case the unmarked original stays put (P2-1).
- **Destination must start empty:** `handleMark` lists the To folder first and **blocks the run** with a message if it isn't empty, so marked papers never mix with / overwrite prior output (P2-1).
- **"Create new folder for marked documents"** (button under the To picker → `handleCreateMarkedFolder` → `createMarkedFolder(root)`): makes a fresh, always-empty `"Marked <YYYY-MM-DD>"` subfolder (versioned `" (2)"`, `" (3)"`… per day) and selects it as the destination — the one-click way to satisfy the empty-destination rule.
- On finish, a success banner summarises counts; an `allowance-refresh` window event fires so the Category 1 `AllowanceBar` updates.
- `error === "allowance_exhausted"` is rewritten to a friendly "You've used up your plan's allowance…" message.

---

## 7. Storage & browser dependencies

| Concern | Mechanism | File |
|---|---|---|
| Folder access | File System Access API (`showDirectoryPicker`, read/write) | `lib/fileSystem.ts` |
| Folder handle persistence | IndexedDB `automark-fs` / `handles` / `root` | `lib/fileSystem.ts` |
| Memo archive | IndexedDB `automark-memos` / `memos` (text + original blob) | `lib/memoArchive.ts` |
| Permission model | `queryPermission` (silent, on mount) vs `ensurePermission` (needs user gesture) | `lib/fileSystem.ts` |

**Hard dependency:** `isSupported()` checks for `showDirectoryPicker` → **Chrome/Edge only**. Firefox/Safari/mobile users see an amber "use Chrome or Edge" notice and cannot proceed. (Phase 1 of the expansion plan replaces the picker with `webkitdirectory` + drag-and-drop to lift this.)

---

## 8. Known limits & gaps

- **Browser-only / memory-bound.** Large PDFs are rendered/stamped in the tab; very large files can exhaust memory. No server-side processing.
- **Chrome/Edge only** (File System Access API). Biggest market limiter; Phase 1 fix planned.
- **No OCR.** Image pages are sent as expensive vision tokens; a scanned memo yields no text at all. OCR-then-reason is Phase 5 (see Category 5).
- **Batch needs the tab open** for the up-to-20-minute poll; closing it loses progress. Server-side batch tracking is an expansion-plan item.
- **`mockResult()` is dead code** — routes 503 without a key instead.
- **Whole-file failure granularity** in instant mode: an exception aborts the loop (the `From` list is re-read in the `catch`), so a mid-run failure can leave some papers unmarked. Per-paper resilience is a Category 4 concern.
- **Mark placement depends on `[y=…]` hints** from the text layer; pages that fall back to image rely on the model reading position from the picture (less precise).

---

## Problems / To-Fix Backlog

> Severity: 🔴 fix before real paying customers · 🟠 important · 🟡 minor/polish · 🔵 not-built/roadmap.

| ID | Sev | Problem | Fix direction |
|----|-----|---------|---------------|
| ~~**P2-1**~~ | ✅ | ~~**Output overwrite = data loss**~~ — **Resolved.** Three layers now: (1) the run is **blocked unless the destination folder starts empty** (`handleMark` lists it first and aborts with a message); (2) marked writes go through `uniqueName()`, which versions collisions as `"X (marked) (2).pdf"` instead of overwriting; (3) the new **"Keep for marking"** setting can leave the unmarked original in the source folder. | Done — `app/page.tsx` `handleMark`/`runInstant`/`runBatch`, `lib/fileSystem.ts` `uniqueName`/`fileExists`, `SettingsPanel` `keepOriginals`. |
| **P2-2** | 🟠 | **Blank-page false-skip** — `isCanvasBlank` skips a page with < 0.2% ink; a faint or low-contrast real answer page can be dropped → **answers silently unmarked**. | Lower the threshold, or surface "N pages skipped as blank" to the user. |
| **P2-3** | 🟠 | **Instant loop aborts on first error** → later papers left unmarked (batch isolates per-paper). | Wrap each paper in its own try/catch like the batch GET does. |
| **P2-4** | 🟠 | **`max_tokens: 4096` truncation** — papers with many annotations can exceed it → JSON cut off → parse fails (whole paper in instant). (= P5-3) | Raise the cap, or split very large papers. |
| **P2-5** | 🟡 | **Memory pressure** — `preparePaper` slice-copies the whole PDF; `runBatch` holds *all* originals + pages in memory before submitting → OOM on large batches. | Stream/chunk; release bytes after submit. |
| **P2-6** | 🟡 | **No image size cap** — fallback pages become base64 PNG with no resolution/size limit → very large request bodies. | Cap render resolution before encoding. |
| **P2-7** | 🟡 | **Fixed extraction heuristics** — line-group (0.012) and blank (0.002) thresholds misbehave on unusual layouts → misgrouped lines / misplaced `y` hints. | Tune or make adaptive. |
| **P2-8** | 🟡 | **Non-PDFs blindly moved** to the To folder (may move files the user didn't intend to touch). | Confirm / filter what gets moved. |
| **P2-9** | 🔵 | **Not built** — Chrome/Edge-only picker (Phase 1), no OCR (Phase 5), batch needs the tab open (Phase 1/3). | Expansion plan. |

---

## 9. Key files (quick reference)

| File | Role |
|------|------|
| `lib/markPaper.ts` | `preparePaper` (extract), `stampPaper` (draw), `markInstant`, `extractMemoText` |
| `lib/markingPrompt.ts` | `MODELS`, `PageContent`/`Annotation` types, `buildSystem`/`buildContent`, `parseMarkResponse`, (unused) `mockResult` |
| `lib/fileSystem.ts` | File System Access API + IndexedDB folder handles; move/write/read |
| `lib/memoArchive.ts` | IndexedDB memo (answer-key) persistence |
| `app/page.tsx` | Orchestrates the flow: connect → From/To → memo → subject → strictness → mode → Mark; `runInstant`, `runBatch`, `pollBatch` |
| `app/api/mark/route.ts`, `app/api/mark/batch/route.ts` | Server Claude calls (+ Category 1 gates) |

## 10. Cross-references
- Allowance gates wrapping these routes → **Category 1** (§7)
- Prompt design, model mapping, JSON schema, OCR plans → **Category 5**
- PDF failure handling & per-paper resilience → **Category 4**
- File-picker replacement & UI copy → **Category 3** / `../expansion-plan.md` Phase 1
- Throughput/capacity ceiling → `../expansion-plan.md` Phase 3
