---
date: 2026-11-19
time: 14:00 to 14:45 Europe/Lisbon
attendees: Ana, Ben, Chioma, Tomás
facilitator: Ana
note_taker: Tomás
---

# Refunds API v1 shutdown: recap

## Decisions

1. Turn off the v1 refunds API on 2027-01-15.
2. Send the shutdown notice to the 4 clients that still call v1 this week.

## Action items

- [ ] **Ben**: Send the shutdown notice to the 4 clients. Due 2026-11-20.
- [ ] **Tomás**: Publish the migration guide. Due 2026-11-27.
- [ ] **Ana**: Ask legal whether the contract with the largest client allows the shutdown date. Due TBD.
- [ ] **TBD**: Add the shutdown date to the status page. Due TBD.

## Summary

### Shutdown date for the v1 refunds API

**Ana** proposed 2027-01-15, eight weeks after the notice. **Ben** and **Chioma** agreed.

### A read-only v1 for one client

**Chioma** said the largest client might need to read old refunds through v1 after the shutdown. The team did not decide it, because the contract may set a later date.

### Clients that still call v1

**Ben** said 4 clients still call v1, and 1 of them makes 90% of the calls. Each client gets the notice from **Ben**.

### Status of the migration guide

**Tomás** said the draft is complete except for the steps to move webhooks.

## Open questions

- Does the largest client keep a read-only v1 after 2027-01-15? **Chioma** raised it. **Ana** asks legal first.

## Next meeting

2026-12-03, 14:00 to 14:45 Europe/Lisbon.
