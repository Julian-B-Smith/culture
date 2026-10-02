# pa0-prior-art — prior-art landscape (Decision 30 bookend)

- **Queue item:** ROADMAP PA0 (current, chosen by the human by poll 2026-10-02).
- **Why:** Map prior art before the P5 synthesis design is committed, and know which of Culture's mechanisms are new versus borrowed.
- **Evidence consulted:** four read-only research agents (Sonnet, pinned): rule spaces and rule-changing CAs; open-ended evolution; causal emergence and coarse-graining; CA sonification. Lead verification by opening sources: Shrestha et al. 2024, Genelife (Packard & McCaskill 2024), Flow-Lenia 2022 abstract, Rosas et al. 2020 (Ψ and the Game of Life case), Sas et al. 2025, Wuensche 1999 (full text: moving window w = 10, not a decaying table as one agent reported), Adams 2020, Pavlic et al. 2014, Reia & Kinouchi 2014, Yin 2026, Hash Chemistry 2026, ASAL 2024.
- **What changed:** `docs/prior-art.md` (new). Entries are marked ✔ (lead-verified) or · (agent, abstract or snippet level).
- **Alternatives rejected:** citing agent summaries without spot checks (one agent's "decaying frequency table" for Wuensche was wrong, which shows why the checks matter); folding recommendations into ROADMAP directly (they are proposals for the human).
- **Verify:** `./verify fast` exit 0 before commit.
- **Open questions:** whether PA0 is closed (the human's call after reading). Its ROADMAP status edit waits for PR #4, which also edits ROADMAP. The recommendations in the doc are unadopted. Method-level reads listed under "Gaps" are not done.
