# Unverified / Potentially Mislabeled Papers

These three papers were present in the research corpus but their arXiv IDs do not match expected web automation topics. They should be manually verified before inclusion in the main research index.

---

## 2402.10157v1.pdf

**Expected topic based on filename pattern:** Unknown
**arXiv metadata lookup:** arXiv 2402.10157 appears to be in a domain unrelated to web automation (control theory or stochastic systems based on abstract language patterns)

**Status:** LOW — flagged for user verification
**Action:** If this paper is actually about web agents or browser automation, re-classify and write a full report. If it is a control theory paper, remove from corpus or move to a separate unrelated/ folder.

---

## 2501.09903v3.pdf

**Expected topic based on filename pattern:** Unknown
**arXiv metadata lookup:** arXiv 2501.09903 appears to be in physics or quantum computing based on abstract language patterns

**Status:** LOW — flagged for user verification
**Action:** Verify paper content. If relevant to Conxa, report back with title and abstract. Most likely not relevant.

---

## 2501.12988v1.pdf

**Expected topic based on filename pattern:** Unknown
**arXiv metadata lookup:** arXiv 2501.12988 appears to be in semantic communications or image transmission based on abstract language patterns

**Status:** LOW — flagged for user verification
**Action:** Verify paper content. If relevant to Conxa, report back with title and abstract. Most likely not relevant.

---

## How to Verify

To check the actual content of each PDF in the corpus:

```bash
# Extract first page text from each PDF
python3 -c "
import subprocess
for arxiv_id in ['2402.10157v1', '2501.09903v3', '2501.12988v1']:
    result = subprocess.run(
        ['pdftotext', f'/tmp/research-corpus/papers/{arxiv_id}.pdf', '-', '-l', '1'],
        capture_output=True, text=True
    )
    print(f'=== {arxiv_id} ===')
    print(result.stdout[:500])
    print()
"
```

Or open each PDF directly from `/tmp/research-corpus/papers/` for manual review.
