# Steady — Study Protocol

A small, remote, within-subjects evaluation of Steady with people who have tremor or reduced motor control. This protocol has enough detail to run a session tomorrow. It is **not** a substitute for ethics review. If you are affiliated with a university, or plan to publish, get IRB/REB approval first and adapt the consent text to the board's template.

---

## 1. Research questions

1. Does Steady improve pointing performance (throughput, error rate) compared with the participant's usual setup?
2. Does Steady make everyday web tasks (a form, a hover menu, a pop-up) faster or less error-prone?
3. How do participants experience Steady's automation, in terms of **trust**, **sense of control**, and **fatigue**?

## 2. Participants

- **Target:** 6–10 adults who self-report difficulty using a mouse or trackpad because of Parkinson's disease, essential tremor, ALS/MND, MS, or a similar condition.
- **Inclusion:** uses a computer with a mouse, trackpad, or other pointer at least weekly; can use Chrome on a laptop or desktop; can join a video call and share their screen.
- **Exclusion:** cannot use any pointing device (the switch-scanning mode could be a separate study).
- **Compensation:** state the amount and method up front, for example a $30 gift card per 60-minute session. It is paid even if the participant stops early.
- **Recruitment channels:** local Parkinson's / ALS society groups (with the organiser's permission), occupational therapists, and accessibility-focused online communities. Never approach patients directly through clinical contacts.

### Recruitment message template

> **Help test a free tool that makes websites easier to use with a tremor**
>
> Hi! I'm [NAME], a [recent graduate / researcher] building **Steady**, a free Chrome extension for people whose hand movements make the mouse hard to use (for example Parkinson's, essential tremor, or ALS). Steady smooths out shaky cursor movement, makes buttons easier to hit, and can click for you when you hold the cursor still.
>
> I'm looking for **6–10 people** to try it in a **one-hour video call** from home. You would try a few short tasks with and without Steady and tell me what you think. There are no right or wrong answers. We are testing the tool, not you.
>
> - When: at a time that suits you, with breaks whenever you want
> - Where: online (Zoom / Google Meet); you use your own computer
> - Thank-you: a [$30] gift card
> - Privacy: no video recording; your results are stored under a code, not your name
>
> Interested, or have questions? Reply to [EMAIL]. You're also welcome to have a family member or carer with you during the session.

## 3. Consent (plain language)

Read this aloud, share it on screen, and send it by email beforehand. Record verbal consent in the facilitator notes (a checkbox on the demo page's notes field is enough: "Consent given verbally at 14:02").

> **What this is.** You are invited to help test Steady, a Chrome extension that makes websites easier to use when your hand movements are shaky or slow. The session lasts about one hour, on a video call.
>
> **What you'll do.** You'll install Steady, try a pointing game and three everyday tasks (a form, a menu, and a pop-up) both with and without Steady, answer two short questionnaires, and talk with me about how it felt.
>
> **What we record.** Task times and errors, your questionnaire answers, and my written notes. With your permission, Steady also keeps a log of its own events on your computer (for example "dwell click happened"), which you can export and send to me. We **do not** record video or audio, and we **do not** use your webcam. Your results are stored under a code (like "P07"), not your name.
>
> **Your choices.** Taking part is voluntary. You can take a break, skip any task or question, or stop at any time without giving a reason, and you'll still receive the thank-you gift. If you stop, you can ask us to delete your results.
>
> **Risks.** The tasks involve using a mouse for a few minutes at a time, which may be tiring. Please tell me if you get tired or uncomfortable; we'll pause. There are no other known risks.
>
> **Afterwards.** You can keep using Steady for free or uninstall it (right-click the icon → "Remove from Chrome"). Anonymised, combined results may appear in a portfolio case study or report. Nothing will identify you.
>
> **Questions?** Contact [NAME, EMAIL].
>
> Do you agree to take part? And separately: is it OK for Steady to keep its on-computer event log during the session?

## 4. Setup (before the session)

1. Send the participant the Chrome Web Store link (or the unpacked build with written install instructions if Steady is not published yet), the demo URL, and the consent text.
2. Facilitator checklist:
   - Demo page open at `…/steady/` (GitHub Pages) with Steady installed on the facilitator's machine for a dry run.
   - Participant ID assigned (P01, P02, …). **Alternate condition order A/B** by ID: odd = A (Steady first), even = B.
   - Timer, the interview guide below, and a notes document.

## 5. Session script (≈ 60 min)

| Time | Step | Script / actions |
| --- | --- | --- |
| 0–10 min | **Intro** | Welcome; confirm the participant can hear and see. Read the consent; record verbal consent. Ask about their computer, pointing device, and condition in their own words ("How does your condition affect using a mouse, if at all?"). Remind them they can pause any time. |
| 10–25 min | **Install and calibration** | Guide the install (screen share). Open the demo page → **1. Calibration**. Try *Steady (mild)*, then *Steady (strong)*, and let the participant move the pointer across the trace box and try clicking a few buttons. Pick the profile they prefer ("Which one feels more in control?"). If clicks are hard, try *Rest mode* (dwell). Note the chosen profile. In the popup → **All settings**, turn on **Research study logging** and enter the participant ID (only if they agreed to the log). |
| 25–45 min | **Tasks × 2 conditions** | In section **2. Session**: enter the ID and choose order A or B. For each condition (switch with the radio buttons at the top): **3. Pointing task** (about 5 min; offer a break between rounds), then **4. Everyday tasks** a, b, c, then **5. Questionnaires** (SUS and TLX, about "the setup you just used"). Offer a 2-minute break between conditions. |
| 45–55 min | **Interview** | See the guide below. |
| 55–60 min | **Wrap-up** | **6. Results and export → Download session (JSON)**. If logging was on: popup → **Export log**, and ask the participant to email both files (or share their screen while *you* guide them to attach them). Explain how to keep or remove Steady. Thank them and arrange the gift card. |

**Facilitator rules**
- Never rush. If the participant is tired, drop the pointing task's remaining rounds (press **Stop**) and do the everyday tasks.
- Don't help with a task unless asked, or unless they're stuck for more than 60 s. Note any help given.
- Record observations in the notes field: hesitations, comments ("it's pulling me"), and workarounds.

## 6. Interview guide (5 questions, ~10 min)

1. **Control.** "When Steady highlighted a button or clicked for you, did it feel like *you* were in control? Tell me about a moment when it did something you didn't expect." *(Probe: the ring, the snapping, dwell.)*
2. **Trust.** "Did you trust that Steady would click the thing you meant? What would make you trust it more?"
3. **Fatigue.** "How did your hand or arm feel with and without Steady? Did anything make you more or less tired?"
4. **Everyday fit.** "Where would this help most in your normal week, and where would it get in the way?" *(Probe: specific sites, the panic toggle.)*
5. **Change one thing.** "If you could change one thing about Steady, what would it be?"

## 7. Data and analysis plan

**Data collected per participant:** the demo session JSON (Fitts trials, everyday tasks, SUS, TLX, facilitator notes); optionally the Steady study log (capture changes, dwell fires and cancels, activations, sample rate, task markers); and interview notes.

**Storage:** an encrypted folder, with files named by participant ID only. Keep the ID-to-name key separately and delete it when the study ends.

**Quantitative (paired, within-subjects; n is small, so emphasise effect sizes and confidence intervals over p-values):**
- **Pointing throughput** (bits/s): per participant, the mean of the 6 per-round values for each condition. Report **nominal throughput** (ID/MT) as the primary measure. Effective throughput (ISO 9241-9) is reported too, but **caveat it**: with target snapping, Steady clicks at the target centre, so endpoint spread (and hence *We*) collapses, which inflates effective throughput. This is a known issue when evaluating bubble cursors.
- **Error rate** per condition.
- Paired comparison: Steady − baseline differences with a 95% CI. Use a **Wilcoxon signed-rank test** (small n, likely non-normal) and report the matched-pairs rank-biserial correlation. Plot a per-participant slope graph (baseline → Steady).
- **Everyday tasks:** completion (yes/no), time, and errors per task and condition. Descriptive, plus paired differences.
- **SUS** (0–100) and **raw TLX** (0–100): descriptive (median, IQR) per condition, with per-participant pairs shown.
- Check for an **order effect** (A vs B) descriptively.

**Qualitative:** thematic analysis of interview notes and observations (Braun & Clarke, 2006). Code first for *control / agency*, *trust / predictability*, *fatigue / effort*, *fit with daily life*, and *suggestions*, then let new codes emerge. Two passes, a week apart. Report themes with short anonymised quotes.

**Log analysis (if collected):** dwell fire vs cancel ratio, cancels by reason (moved vs Escape) as a proxy for unwanted activations, time spent resting, and how often the panic toggle or profile switches were used.

## 8. Safety and stopping rules

- Stop immediately if the participant reports pain, distress, or unusual fatigue.
- Do not give medical advice. If the participant raises health concerns, suggest their clinician or OT.
- If Steady misbehaves on the participant's computer, use **Ctrl+Shift+S** (panic toggle) or remove the extension. Note the problem as a finding.
