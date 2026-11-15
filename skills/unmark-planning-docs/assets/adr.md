---
status: Accepted
owner: Tomás Ruiz
updated: 2026-11-06
---

# 0007. Read bank statements with one column mapping, not a parser for each bank

## Context

Ledgerly will import the CSV statements of bank accounts. The [requirements](requirements.md) give the scope.

- Each bank writes its own columns, its own date format, and its own sign for an amount that leaves the account.
- The 5 banks that most users name in the survey use 5 different column layouts.
- A bank can change its layout without notice. Two of the 5 banks changed their layout in 2026.
- Two engineers work on the import until 2027-03-01.
- The user must see each row before the import adds it (requirement R4).

## Decision

We will read every CSV statement with one reader. At the first import into a bank account, the user maps the date, amount, and description columns. Ledgerly saves that mapping for the account.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A parser for each bank | Each new bank, and each change of layout, needs a release. Two of the 5 banks changed their layout in 2026. |
| A service that connects to the bank | The service charges a fee for each connected account. A live bank connection is a non-goal of the requirements. |

## Consequences

### What gets easier

- A user can import from any bank that writes a CSV statement.
- A change of layout at a bank needs no release of Ledgerly.

### What gets harder

- The first import into each account has one more step, the mapping.
- A user can map a column wrong. Support then helps the user correct the mapping.

### What we must do now

- [ ] Add the mapping step to the design of the import. Owner: Mei Chen.
- [ ] Store one mapping for each bank account. Owner: Tomás Ruiz.
- [ ] Write the help article about the mapping step. Owner: Lena Hoffmann.
