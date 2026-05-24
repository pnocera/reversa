# Spec Examples: Good vs. Bad

These examples use the "Email Notifications" feature to illustrate the difference.

---

## ❌ Bad Spec — Score: 32/100

```markdown
# Spec: Notifications

## What we're going to do
Implement email notifications for users when something important happens.

## Requirements
- The system must send emails
- The emails must look nice
- The user must be able to disable notifications
- It must be fast

## Technical notes
Use SendGrid or SES. Maybe use an SQS queue.
```

### Why it's bad:

| Problem | Impact |
|---------|---------|
| "when something important happens" — what is important? | Dev implements what they think is right, not what the business wants |
| "emails must look nice" — not testable | No acceptance criteria possible |
| "must be fast" — no number | Bug: email takes 5 min, dev thinks it's fine |
| Non-goals missing | Scope creep: "what about SMS? what about push notifications?" |
| Edge cases missing | What happens if the email bounces? If the user disabled it? |
| Mixes spec with technical decision (SendGrid/SES/SQS) | Couples "what" to "how" unnecessarily |
| No requirement IDs | Impossible to trace which requirement a PR implemented |

---

## ✅ Good Spec — Score: 87/100

```markdown
# Spec: Email Notifications — Account Activity

**Version:** 1.0 | **Status:** Approved | **Date:** 2025-01-15

## 1. Summary
Send transactional email notifications to users when relevant account events
occur, with granular notification preference controls.

## 2. Context and Motivation
**Problem:** Users miss important actions (e.g., new comment, payment processed)
because they only find out when they open the app. Result: delayed engagement and abandoned tasks.
**Evidence:** 68% of inactive users cited "I didn't know something was waiting" in the
Dec/2024 churn survey.
**Why now:** Email platform contracted (SendGrid), integration feasible in 1 sprint.

## 3. Goals
- [ ] G-01: Users receive email in < 2 min after trigger event
- [ ] G-02: Open rate ≥ 25% (benchmark: 21% in the sector)
- [ ] G-03: 100% of users can disable notifications in ≤ 3 clicks

## 4. Non-Goals
- NG-01: Push notifications (mobile) — future version
- NG-02: SMS notifications — not on the 2025 roadmap
- NG-03: Marketing emails / newsletters — Growth team's scope
- NG-04: Support for multiple email addresses per user

## 5. Users
**Primary:** User with an active account, any plan.
**Current journey:** User must open the app to see if there is anything new.
**Future journey:** User receives an email with an event summary and a direct link to the action.

## 6. Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| RF-01 | The system must send an email when a comment is added to a user's item | Must | Email received in < 2 min in 95% of cases (test with 100 sends) |
| RF-02 | The system must send an email when a payment is processed (success or failure) | Must | Email received in < 2 min; includes amount, date, and status |
| RF-03 | The user must be able to disable each notification type individually in Settings > Notifications | Must | Toggle persists after logout/login; email of disabled type is not sent |
| RF-04 | The system must include an "unsubscribe from all notifications" link in the footer of every email | Must | Link works without login; redirects to confirmation page |
| RF-05 | The system must group notifications of the same type into a daily digest when there are > 5 events within 1 hour | Should | User receives 1 email listing the 5+ events, not 5+ separate emails |

### Main Flow (RF-01)
1. User B comments on User A's item X
2. System detects the `comment.created` event
3. System checks if User A has RF-01 enabled (default: enabled)
4. System sends an email to User A with: commenter's name, comment excerpt (max. 200 chars), direct link to the item
5. Result: User A receives the email in < 2 min

## 7. Non-Functional Requirements
| ID | Requirement | Target |
|----|-------------|--------|
| RNF-01 | Send latency | P95 < 2 min after event |
| RNF-02 | Delivery rate | ≥ 98% (excluding permanent bounces) |
| RNF-03 | Security | Unsubscribe links with unique, signed token |

## 11. Edge Cases

| ID | Scenario | Trigger | Behavior |
|----|----------|---------|----------|
| EC-01 | Invalid email / permanent bounce | SendGrid returns a hard bounce | Disable sends to that email; notify user in-app |
| EC-02 | User disabled notifications | `user.notifications.comments = false` | Do not send; do not log an error |
| EC-03 | SendGrid unavailable | Timeout or 5xx error | Retry with backoff: 1 min, 5 min, 30 min. After 3 failures: log and alert the team |
| EC-04 | User deleted account before send | User ID not found in the queue | Discard silently; log for audit |
| EC-05 | Same event fires twice | Duplication bug | Deduplicate by event_id with a TTL of 1 hour |

## 14. Open Questions
| # | Question | Impact | Deadline |
|---|----------|--------|----------|
| OQ-01 | ⚠️ OPEN: Daily digest (RF-05) — what time should it be sent? User's timezone or UTC? | Medium | 01/20 |
```

### Why it's good:

| Strength | Benefit |
|----------|---------|
| Each requirement has an ID, priority, and acceptance criteria | QA writes tests directly from the table |
| Explicit non-goals (4 items) | The team knows exactly what to decline |
| Edge cases cover external failures | Dev implements retry without having to ask |
| Numeric metrics (< 2 min, ≥ 25%) | Success is verifiable |
| Open question flagged with `⚠️ OPEN:` | Ambiguity is visible, not silent |
| Step-by-step main flow | LLM implements without assumptions |

---

## 🔶 Average Spec — Score: 63/100

```markdown
# Spec: Login with Google

## Objective
Allow users to log in using their Google account.

## Requirements
- RF-01: Add a "Sign in with Google" button on the login screen
- RF-02: User must be redirected to Google's OAuth
- RF-03: After authentication, create a user session
- RF-04: If the email already exists in the system, log in to the existing account
- RF-05: If the email does not exist, automatically create a new account

## Out of scope
- Login with Facebook/Apple for now

## Edge Cases
- What if the user cancels the OAuth flow?
- What if Google is down?
```

### What's good:
- Numbered requirements ✅
- Non-goals present ✅
- Edge cases identified (but without answers) ⚠️

### What's missing (-37 points):
- Edge cases without defined behavior — "what if?" without an answer (-10)
- No acceptance criteria in the requirements (-7)
- Security section missing (OAuth data, tokens) (-8)
- No success metrics (-7)
- RF-03 "create session" — for how long? With what data? (-5)
