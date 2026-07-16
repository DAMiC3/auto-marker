// Steps for components/GuidedTour.tsx. Each `target` matches a `data-tour="…"`
// attribute somewhere in the app shell — see Sidebar.tsx / app/page.tsx.
// The tour is interactive: the spotlighted control stays clickable, so the user
// can actually do each step (connect a folder, open a select…) as they go.
export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: "create-structure",
    title: "Set up your folders in one click",
    body:
      "AutoMark works with three folders: one for papers to mark, one for finished (marked) papers, and one for your memo. " +
      "Not sure how to arrange them? Click “Create folder structure”, choose where to put it, and AutoMark builds all three for you — and selects them automatically.",
  },
  {
    target: "connect",
    title: "…or connect a folder you already have",
    body:
      "Already keep your papers in a folder? Click “Connect your files” and choose it — its subfolders become your classes. " +
      "If you’re unsure, just pick any empty folder and follow the rest of the steps.",
  },
  {
    target: "from-folder",
    title: "Choose where the papers come FROM",
    body:
      "Pick the folder that holds the student papers you want to mark. If you used “Create folder structure”, this is already set to “Documents to mark”.",
  },
  {
    target: "to-folder",
    title: "Choose where marked papers go TO",
    body:
      "Pick the folder your marked papers should be saved into — it must start empty. “Create folder structure” sets this to “Marked documents” for you.",
  },
  {
    target: "memo",
    title: "Add your memo (answer key)",
    body:
      "Add the memo AutoMark marks against. Keep the memo file out of your “to mark” folder, or it’ll be treated as a paper and marked too.",
  },
  {
    target: "strictness",
    title: "Set the strictness",
    body: "Controls how lenient or strict the AI is when marking — from forgiving paraphrasing to exact-match only.",
  },
  {
    target: "mode",
    title: "Instant vs Batch",
    body: "Instant marks papers right away. Batch is about half the price and runs in the background — keep the tab open while it works.",
  },
  {
    target: "mark-button",
    title: "Mark",
    body: "Once everything’s set, hit Mark. Marked PDFs land in your To folder automatically, with ticks, scores, and notes stamped on.",
  },
  {
    target: "account",
    title: "Settings & account",
    body: "Open this menu to reach Settings — mark types, marking engine, profile, the best-practices guide — or to sign out.",
  },
  {
    target: "allowance",
    title: "Your allowance",
    body: "Shows how much of your plan you have left this period, so you always know where you stand.",
  },
  {
    target: "help",
    title: "Need help again?",
    body: "Come back to this tour or the best-practices guide any time from this “?” button.",
  },
];
