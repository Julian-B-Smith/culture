# intake-to-main — restore the intake changes on main; PA0 current

- **Queue item:** unqueued: corrects the outcome recorded in `traces/2026-10-02-intake-autonomous.md`.
- **Why:** PR #3 was stacked on `p1-core` and merged into that branch, not `main`, so the Mailbox section, the committed notice and the phase marker never reached `main` (found by `/wakeup`: state.py reported no phase marked; `git log origin/main` had no intake commit).
- **Evidence consulted:** `git branch -r --contains`, `git show origin/main:CLAUDE.md`, the prior trace.
- **What changed:** the intake commit cherry-picked onto `main`; the `← current` marker moved from P1 (merged) to PA0, which the human chose next by poll.
- **Alternatives rejected:** merging `origin/p1-core` into `main` (would also bring a merge commit for an already-merged PR; the cherry-pick is the minimal change).
- **Verify:** `./verify fast` exit 0 before commit.
- **Open questions:** none. Lesson for stacked PRs: retarget the stacked PR to `main` before merging its base, or merge in order.
