# Arc 3 — Predict the Baseline, Not Just Sum It
### Agentic conversation script · Forecast & Risk Agent

**Persona:** David Chen — Key Account Manager, Acme Partners (FY26 Commercial Plan)
**Agent:** ✦ Agentforce · Forecast & Risk Agent
**Surface:** Planning & Forecasting FY26 — Grid View (`/home/manufacturing-acme`), right‑side Agentforce panel
**Grounding data (from the live grid):**
- Forecast Quantity (committed): **13.84M** · ✦ Predicted Baseline Quantity: **14.73M**
- Midwest Assembly baseline: **46.8K → 58.9K (+26%)** across FY26
- Southwest Stamping baseline: **~21.2K, flat (+1%)**
- E‑Motor Housing baseline: **10.1K → 15.1K (+50%)** — flagged **Low confidence**
- Midwest e‑motor ramp trending **~18% above committed agreement volume**

> Convention: `[ ... ]` = on‑screen action / stage direction. `✦ Action:` = agent reasoning/tool chip shown in the transcript.

---

## Beat 0 — The setup

**[David is on the FY26 grid. The Forecast Quantity row shows 13.84M. He opens the Agentforce panel.]**

**David:** My Forecast Quantity for Acme rolls up to 13.84 million units. Is that the number I should be planning to?

**✦ Forecast & Risk Agent:** That 13.84M is a *calculated sum* — Sales Agreement + Opportunity + Order Quantity — so it tells you exactly where you stand **today**. It updates the moment the underlying data changes, but it can't tell you where demand is **heading**. Want me to project a forward baseline from your history?

**David:** Yes — do it.

---

## Beat 1 — Generate the Predicted Baseline

**✦ Action:** *Reading curated order history from Data Cloud (DPE transforms) · fitting trend + seasonality · flooring at committed agreements · lifting by stage‑weighted pipeline.*

**✦ Forecast & Risk Agent:** Done. I've added **✦ Predicted Baseline Quantity** directly beneath Forecast Quantity.

- It's an AI projection off the same curated order data your Admins already prepared in Data Cloud.
- It's **floored by committed agreements** (it never drops below what's contracted) and **lifted by stage‑weighted pipeline**.
- For FY26 it rolls to **14.73M** — about **6% above** the committed sum. That gap is the momentum a static sum can't see.

**[The ✦ Predicted Baseline Quantity row appears in the grid, 14.73M.]**

**David:** Six percent overall — but where is that coming from?

---

## Beat 2 — Watch the two curves diverge

**✦ Forecast & Risk Agent:** It's not spread evenly — that's the important part. Let me expand the two agreement plants under North America → Light Trucks and chart the baseline.

**✦ Action:** *Expanding Midwest Assembly & Southwest Stamping · comparing monthly baseline.*

**[Charts panel opens in Compare mode with Midwest Assembly and Southwest Stamping selected. Two lines on one shared scale.]**

**✦ Forecast & Risk Agent:** Watch the two curves diverge:
- **Midwest Assembly** bends sharply upward — **46.8K in January climbing to 58.9K by December (+26%)**. The model sees the **EV ramp building**.
- **Southwest Stamping** stays flat — **~21.2K all year (+1%)**. Steady legacy chassis.

A simple committed sum would show both plants as "on plan." The baseline shows one is accelerating and one is holding.

**David:** So the growth is almost entirely a Midwest story.

**✦ Forecast & Risk Agent:** Correct. And within Midwest, one program is doing the heavy lifting.

---

## Beat 3 — The confidence band flags the risk

**✦ Action:** *Drilling into Midwest programs · computing confidence band from historical volatility.*

**[Midwest Assembly expands to programs. E‑Motor Housing shows the steepest ramp; the Confidence band tab shows a warning icon with red dots on the low‑confidence months.]**

**✦ Forecast & Risk Agent:** Here's the sharpest line — **E‑Motor Housing**, climbing **10.1K → 15.1K (+50%)**. But notice the **confidence band**: I've flagged this program **Low confidence**. It's a **brand‑new program with little history**, so the model can project the shape but not stand firmly behind the magnitude.

That single flag is what sets up your next move.

**David:** Meaning?

---

## Beat 4 — The recommendation (agent recommends; David decides)

**✦ Forecast & Risk Agent:** The **Midwest e‑motor ramp is trending ~18% above committed agreement volume** — demand the baseline expects but that isn't yet locked in a signed agreement. A manual sum would hide that gap entirely; it only counts what's already committed.

My recommendation, in priority order:
1. **De‑risk supply** for the e‑motor ramp — flag the ~18% uncommitted upside to Ops before you commit capacity.
2. **Convert pipeline to agreement** at Midwest to move that upside from "predicted" to "committed."
3. **Leave Southwest as‑is** — flat and steady; no action needed.

I can draft the capacity‑risk note to Ops, or open a renewal play on the Midwest e‑motor pipeline. **Which would you like — or neither?**

**David:** Draft the capacity‑risk note to Ops, and keep the baseline visible on the plan.

**✦ Forecast & Risk Agent:** Done — draft note prepared for your review, and ✦ Predicted Baseline Quantity is pinned to the FY26 plan alongside Forecast Quantity. You now plan against **where demand is heading**, with the **uncertainty made explicit** — not just where it is today.

---

## Closing frame

> **The shift:** from *"where am I today"* (a sum) to *"where is this heading — and what's least certain"* (a predictive baseline + confidence band). The agent surfaces the divergence and the risk; **the Key Account Manager decides.**

---

### Optional shorter cut (60‑second demo)

1. **David:** "Forecast is 13.84M — is that what I plan to?"
2. **Agent:** "That's today's sum. Let me project a baseline." → adds **✦ Predicted Baseline (14.73M)**.
3. **Agent:** "Watch them diverge — **Midwest +26%** (EV ramp), **Southwest flat**."
4. **Agent:** "**E‑Motor Housing +50%, but Low confidence** — brand‑new program."
5. **Agent:** "It's trending **~18% above committed volume** — a risk a sum would hide. Draft the Ops note?"
6. **David:** "Do it." → *Agent recommends; David decides.*
