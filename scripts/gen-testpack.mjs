// Generates a ready-to-test marking pack (typed PDFs) for AutoMark.
//   TestPapers/Memo.pdf            ← the marking memorandum (answer key)
//   TestPapers/Inbox/Student_A.pdf ← a strong student answer (~12/15)
//   TestPapers/Inbox/Student_B.pdf ← a weak student answer  (~6/15)
//   TestPapers/Marked/             ← empty (destination)
import { PDFDocument, StandardFonts, rgb } from "../node_modules/pdf-lib/cjs/index.js";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const OUT = "C:\\Users\\Michael Bernard\\TestPapers";
mkdirSync(path.join(OUT, "Inbox"), { recursive: true });
mkdirSync(path.join(OUT, "Marked"), { recursive: true });

async function makePdf(title, blocks) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]); // A4
  const margin = 56;
  const maxW = 595 - margin * 2;
  let y = 842 - margin;

  function wrap(text, f, size) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (cur && f.widthOfTextAtSize(t, size) > maxW) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function line(text, { size = 11, f = font, gap = 4 } = {}) {
    for (const ln of wrap(text, f, size)) {
      if (y < margin + 20) { page = doc.addPage([595, 842]); y = 842 - margin; }
      page.drawText(ln, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size + gap;
    }
  }

  line(title, { size: 15, f: bold, gap: 10 });
  for (const b of blocks) {
    if (b.h) line(b.h, { size: 12, f: bold, gap: 6 });
    if (b.p) line(b.p, { gap: 4 });
    if (b.sp) y -= b.sp;
  }
  return doc.save();
}

const memo = await makePdf("TAXATION 1 — TEST 1 — MARKING MEMORANDUM (Total: 15)", [
  { h: "Question 1 — Define 'gross income' (5 marks)" },
  { p: "Award 1 mark for each element:" },
  { p: "1. The total amount, in cash or otherwise." },
  { p: "2. Received by or accrued to the taxpayer." },
  { p: "3. During the year of assessment." },
  { p: "4. From a source within the Republic (residents: worldwide)." },
  { p: "5. Excluding receipts or accruals of a capital nature." },
  { sp: 8 },
  { h: "Question 2 — Restraint of trade (5 marks)" },
  { p: "Lerato (a natural person) receives R10 000 for a restraint of trade." },
  { p: "- Such a payment is capital in nature by ordinary principles. (1)" },
  { p: "- However it is a SPECIAL INCLUSION in gross income (paragraph (cA)/(cB)) for a natural person. (2)" },
  { p: "- Therefore the full R10 000 is included in gross income. (1)" },
  { p: "- Conclusion clearly stated. (1)" },
  { sp: 8 },
  { h: "Question 3 — Name 5 special inclusions in gross income (5 marks)" },
  { p: "Any 5, 1 mark each: annuities; restraint of trade payments; lump sums from employment; amounts for services rendered; alimony (historic); fringe benefits; lease premiums; key-man insurance proceeds." },
]);

const studentA = await makePdf("Taxation 1 — Test 1 — Student: A. Strong", [
  { h: "Question 1" },
  { p: "Gross income is the total amount, in cash or otherwise, received by or accrued to a taxpayer during the year of assessment, from a source within the Republic." },
  { sp: 6 },
  { h: "Question 2" },
  { p: "The R10 000 restraint of trade payment looks like a capital amount. But for a natural person it is specifically included in gross income as a special inclusion, so the full R10 000 must be included. It is therefore part of Lerato's gross income." },
  { sp: 6 },
  { h: "Question 3" },
  { p: "1. Annuities. 2. Restraint of trade payments. 3. Lump sums from employment. 4. Amounts received for services rendered." },
]);

const studentB = await makePdf("Taxation 1 — Test 1 — Student: B. Weak", [
  { h: "Question 1" },
  { p: "Gross income is the money a person earns in a year that they must pay tax on." },
  { sp: 6 },
  { h: "Question 2" },
  { p: "The R10 000 is capital so it is not gross income and is not taxed." },
  { sp: 6 },
  { h: "Question 3" },
  { p: "Salary and interest." },
]);

const studentC = await makePdf("Taxation 1 — Test 1 — Student: C. Average", [
  { h: "Question 1" },
  { p: "Gross income is the total amount, in cash or otherwise, received by or accrued to a person during the year of assessment." },
  { sp: 6 },
  { h: "Question 2" },
  { p: "The R10 000 looks like a capital amount because restraint of trade is capital. But I think for an individual it may be specially included, so it could be taxable." },
  { sp: 6 },
  { h: "Question 3" },
  { p: "1. Annuities. 2. Lump sums from employment." },
]);

const studentD = await makePdf("Taxation 1 — Test 1 — Student: D. Excellent", [
  { h: "Question 1" },
  { p: "Gross income is the total amount, in cash or otherwise, received by or accrued to a taxpayer (other than receipts or accruals of a capital nature) during the year of assessment, from a source within the Republic — and for residents, worldwide." },
  { sp: 6 },
  { h: "Question 2" },
  { p: "The R10 000 restraint of trade payment is capital in nature under ordinary principles. However, for a natural person it is a special inclusion in gross income under paragraph (cA)/(cB) of the definition. Therefore the full R10 000 must be included in Lerato's gross income." },
  { sp: 6 },
  { h: "Question 3" },
  { p: "1. Annuities. 2. Restraint of trade payments. 3. Lump sums from employment. 4. Amounts received for services rendered. 5. Lease premiums." },
]);

writeFileSync(path.join(OUT, "Memo.pdf"), memo);
writeFileSync(path.join(OUT, "Inbox", "Student_A.pdf"), studentA);
writeFileSync(path.join(OUT, "Inbox", "Student_B.pdf"), studentB);
writeFileSync(path.join(OUT, "Inbox", "Student_C.pdf"), studentC);
writeFileSync(path.join(OUT, "Inbox", "Student_D.pdf"), studentD);
console.log("✓ Test pack created at", OUT);
