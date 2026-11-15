---
date: 2026-11-12
time: 10:00 to 10:30 Pacific
attendees: Priya, Sam, Lee
facilitator: TBD
note_taker: TBD
---

# Checkout latency review: recap

## Decisions

1. Cache tax rates for one hour.
2. Keep the 500 ms target for this quarter.

## Action items

- [ ] **Sam**: Ship the one-hour cache for tax rates. Due 2026-11-13.
- [ ] **Priya**: Ask finance whether a one-hour-old tax rate is acceptable. Due TBD.
- [ ] **TBD**: Update the dashboard to show p95 by region. Due TBD.

## Summary

### Checkout latency against the target

**Priya** said p95 checkout latency is 840 ms, and the target is 500 ms.

### The tax service call

**Sam** said most of the latency comes from the call to the tax service, and the team could cache rates for an hour. **Lee** agreed. **Priya** asked **Sam** to ship it, and **Sam** agreed to do it by Friday.

### The fraud check

**Lee** said the team might also move the fraud check off the request path. **Priya** said maybe, and did not decide it in this meeting.

### The target for this quarter

**Priya** said the team keeps the 500 ms target for this quarter. **Sam** agreed.

## Open questions

- Does the team move the fraud check off the request path? **Lee** raised it. **Priya** said the meeting would not decide it today.

## Next meeting

TBD.
