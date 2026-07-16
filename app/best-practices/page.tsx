import Link from "next/link";

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "Setting up your folders",
    points: [
      "AutoMark works with three folders: one for papers to mark, one for finished (marked) papers, and one for your memo.",
      "Not sure how to arrange them? Click “Create folder structure” in the left sidebar — choose where to put it and AutoMark builds all three for you and selects them automatically.",
      "Prefer your own layout? Click “Connect your files” and pick any folder — its subfolders become your classes, and you choose which is the From and which is the To folder.",
      "The From folder is where your unmarked papers live; the To folder is where marked copies are saved (it must start empty); the Memo folder is just a tidy place to keep your answer key.",
    ],
  },
  {
    title: "Supported files & your data",
    points: [
      "Typed PDFs work best and cost the least — the text is read directly, so marks land right next to each answer.",
      "Scanned or photographed pages still work, but they're sent as images: they use more allowance and mark placement is less precise.",
      "Handwritten answers aren't supported — AutoMark is built for typed university tests.",
      "Your PDF files are never uploaded. AutoMark reads and writes them directly in the folder you choose; only the extracted text (or, for a scan, a page image) is sent to the AI over a secure connection to do the marking.",
    ],
  },
  {
    title: "Getting your memo right",
    points: [
      "The more specific your memo, the more accurate the marking — write it like you would for a human marker.",
      "Include worked examples for calculation questions, not just final answers.",
      "Spell out partial-mark criteria explicitly — e.g. \"1 mark for the correct formula, 1 for correct substitution, 1 for the final answer.\"",
      "A typed or exported memo works far better than a photographed one — scanned memos aren't read for text.",
      "Keep the memo out of your \"to mark\" folder, or AutoMark will try to mark it as a paper.",
    ],
  },
  {
    title: "Batch vs Instant",
    points: [
      "Instant marks each paper immediately — good when you need results right now, or you're only marking a handful of papers.",
      "Batch is about half the price and runs in the background, but needs the tab to stay open while it processes.",
      "For a full class set, Batch is almost always the cheaper choice.",
    ],
  },
  {
    title: "Saving your allowance",
    points: [
      "Typed PDFs cost far less than scanned ones — scanned pages are sent as images, which use many more tokens than plain text.",
      "\"Standard\" marking engine handles most tests well; save \"High accuracy\" for tricky or high-stakes papers where nuance really matters.",
      "A tighter, well-structured memo means fewer surprises and more consistent marking, which cuts down on re-runs.",
    ],
  },
  {
    title: "Strictness",
    points: [
      "Low (1–3): lenient — accepts paraphrasing and approximate answers.",
      "Middle (4–7): balanced — the default for most subjects.",
      "High (8–10): exact-match only — reserve this for subjects where precise wording or values genuinely matter.",
    ],
  },
  {
    title: "Keeping things organised",
    points: [
      "Consistent file names (e.g. including the student number) make results easier to sort and match up afterwards.",
      "Marked copies are saved as \"<name> (marked).pdf\" in your To folder, so they're easy to spot next to the originals.",
    ],
  },
  {
    title: "What the Settings do",
    points: [
      "Profile — your display name and default subject, used to label runs and pre-fill the subject box.",
      "Default marking strictness — the strictness each new batch starts on; you can still override it per run with the slider on the main screen.",
      "Marking engine — Standard is fast and handles most tests; High accuracy is more thorough for tricky or high-stakes papers but uses more of your allowance.",
      "Original files — “Remove originals” deletes each unmarked paper from the From folder once it's marked; “Keep for marking” leaves it there so you can re-mark it.",
      "Feedback on marked papers — “Include feedback” adds a note per answer and an overall summary on extra pages after each paper; “No feedback” stamps only ticks and scores, which uses less of your allowance.",
      "Mark types — the ticks, crosses and symbols AutoMark stamps, each with its own colour and shape. These are what appear in the margin of marked papers.",
      "Accent colour — a cosmetic theme colour for the app.",
      "You can reopen this guide or replay the guided tour any time from Settings, or the “?” button at the top-right.",
    ],
  },
  {
    title: "Troubleshooting & FAQ",
    points: [
      "Marks look wrong? Tighten the memo's wording and partial-mark criteria before reaching for higher strictness — most inconsistencies trace back to a vague memo.",
      "Ran out of allowance mid-batch? Marking stops on its own: the papers already marked are saved, and the rest stay untouched in your From folder until you renew.",
      "No folder picker, or “can't access this folder”? AutoMark needs Chrome or Edge on a computer — direct folder access isn't available in Firefox, Safari, or on mobile.",
      "A paper wasn't marked? It's left in your From folder so you can retry it. A paper that appears to be trying to trick the marker is moved to a “Problematic papers” folder and skipped.",
      "Where did my papers go? Marked copies go to your To folder; the originals are removed from the From folder unless you chose “Keep for marking” in Settings.",
    ],
  },
];

export default function BestPracticesPage() {
  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to AutoMark
        </Link>

        <h1 className="text-[26px] font-bold text-slate-900 mb-1">Getting the best results</h1>
        <p className="text-[14px] text-slate-500 mb-8">
          A few tips that make marking faster, cheaper, and more accurate.
        </p>

        <div className="flex flex-col gap-5">
          {SECTIONS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-[15px] font-semibold text-slate-900 mb-3">{s.title}</h2>
              <ul className="flex flex-col gap-2.5">
                {s.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-[13.5px] text-slate-600 leading-relaxed">
                    <svg className="w-4 h-4 text-[var(--accent-600)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
