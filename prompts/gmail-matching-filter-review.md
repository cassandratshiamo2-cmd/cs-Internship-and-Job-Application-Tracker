# Tighten Gmail relevance filtering, matching, review, and history

## Objective

Make small, focused changes to Gmail email relevance filtering, ambiguous application matching, manual-review actions, and visible processing history on branch `fix/gmail-matching-filter-review`.

## Investigation findings

- `classifyApplicationEmail` filters Pnet/LinkedIn alerts and newsletter text before applying status patterns. Other recommendation wording may still reach status classification: probing a message that says “These jobs match your profile. You have been shortlisted for these roles” currently classifies it as `Shortlisted`.
- Classification uses status-language patterns; unrelated subject-only phrases are generally insufficient, but extra promotional/security/account-notification regressions are needed to guard against false positives.
- `matchApplication` requires confidence and a unique score gap, and correctly returns `application: null` for ambiguous matches. It currently truncates candidate IDs to five; manual review should retain IDs for all plausible candidates.
- Gmail sync stores match candidate IDs and directs non-matches to review without updating an application.
- The review apply route locks a review-only message, uses the user-selected `applicationId` with `user_id`, runs the existing status/detail safeguards, and changes the message outcome to `reviewed`. Dismissal changes the message outcome to `dismissed` without application updates. Regression tests should prove repeat actions cannot apply an item twice and dismissal leaves all applications unchanged.
- `/api/gmail/history` currently includes ignored rows as well as updated, reviewed, and dismissed rows. Ignored records remain persisted; the endpoint should exclude them from the visible response.
- No change is needed to OAuth, token encryption, leases, quotas, or schema.

## Implementation scope

1. Strengthen content-based filtering of generic promotional/job-recommendation messages so status words like “shortlisted,” “offer,” “interview,” or “assessment” cannot update applications from a generic alert. Do not use sender identity alone. Keep Pnet/LinkedIn and newsletter protections.
2. Preserve genuine personalized application confirmations, assessment/interview invitations, offers, and rejection emails, including messages from job platforms. Add positive and negative parser/classifier regressions for promotional messages, generic recommendations, security/account notifications, unrelated status-word mentions, and personalized application mail.
3. Keep confident unique matching semantics. Return every plausible candidate ID for manual review and never set an arbitrary `application` for ambiguous matches. Add matcher coverage for multiple candidates, including more than five.
4. Add route regressions showing:
   - The selected authenticated user's application alone is changed.
   - Dismissal leaves applications untouched.
   - Once reviewed or dismissed, the same processed message cannot be applied again.
   - Existing status-transition and interview-detail behavior remains in place.
5. Exclude `ignored` outcomes from normal `/api/gmail/history` results while preserving the rows in storage; continue showing `updated`, `reviewed`, and `dismissed` messages.
6. Avoid changing Gmail OAuth, token encryption, sync leases, quota behavior, or database schema.

## Validation

- Run focused Gmail parser, matcher, sync, and route tests.
- Run the complete backend test suite.
- Run `git diff --check`.
- Do not commit or push.
