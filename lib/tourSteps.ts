// Steps for components/GuidedTour.tsx. Each `target` matches a `data-tour="…"`
// attribute somewhere in the app shell — see Sidebar.tsx / app/page.tsx.
export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: "connect",
    title: "Connect your files",
    body: "Start by connecting a folder on your computer. Subfolders inside it become your classes.",
  },
  {
    target: "files-card",
    title: "From, To, and your memo",
    body: "Once connected, pick a From folder (where student papers are), a To folder (where marked papers go), and the memo (answer key) to mark against.",
  },
  {
    target: "strictness",
    title: "Strictness",
    body: "Controls how lenient or strict the AI is when marking answers — from forgiving paraphrasing to exact-match only.",
  },
  {
    target: "mode",
    title: "Instant vs Batch",
    body: "Instant marks papers right away. Batch is about half the price and runs in the background — keep the tab open while it works.",
  },
  {
    target: "mark-button",
    title: "Mark",
    body: "Once everything's set, hit Mark. Marked PDFs land in your To folder automatically, with ticks, scores, and notes stamped on.",
  },
  {
    target: "account",
    title: "Settings & account",
    body: "Open this menu to reach Settings — mark types, marking engine, profile — or to sign out.",
  },
  {
    target: "allowance",
    title: "Your allowance",
    body: "Shows how much of your plan you have left this period, so you always know where you stand.",
  },
  {
    target: "help",
    title: "Need help again?",
    body: "Come back to this tour or the best-practices guide any time from this button.",
  },
];
