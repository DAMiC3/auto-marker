// Steps for components/GuidedTour.tsx. Each `target` matches a `data-tour="…"`
// attribute somewhere in the app shell — see Sidebar.tsx / app/page.tsx.
// The tour is interactive: the spotlighted control stays clickable, so the user
// can actually do each step (connect a folder, open a select…) as they go.
export interface TourStep {
  target: string;
  title: string;
  body: string;
  // Optional illustration rendered inside the tour card. "folders" draws the
  // required folder-structure diagram (see components/GuidedTour.tsx).
  visual?: "folders";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: "connect",
    title: "Connect your folder",
    body:
      "AutoMark reads and writes a folder on your computer. For it to work, that folder should be laid out like this — three folders inside one:",
    visual: "folders",
  },
  {
    target: "create-structure",
    title: "Don’t have that set up? One click does it",
    body:
      "If you don’t already have those folders, click “Create folder structure”, choose where to put it, and AutoMark builds all three for you — then selects them automatically so you can start marking straight away.",
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
