---
kind: how-to guide
owner: platform team
reviewed: 2026-11-01
---

# Rotate the API signing key

This guide replaces the key that signs API tokens. Clients keep working during the rotation, because the API accepts tokens from the old key and the new key until the old tokens expire. The rotation takes about 90 minutes. You spend most of that time waiting.

## What do you need before you start?

| Item | Where to get it | How to check it |
| --- | --- | --- |
| The `keyctl` tool, version 3 or later | The internal package mirror | `keyctl --version` |
| The `signing-admin` role | The platform team | `keyctl whoami` |
| Access to the production cluster | The VPN profile for production | `keyctl ping --env prod` |

> [!IMPORTANT]
> Do the rotation in a change window. A failed step can stop new logins until you reverse it.

## How does the rotation work?

The API signs each new token with one key, the **signing key**. It accepts a token that any key in the **key set** signed. The rotation adds the new key to the key set, makes it the signing key, and removes the old key after the old tokens expire.

```mermaid
flowchart LR
  A["Create the new key"] --> B["Publish the new key"]
  B --> C["Sign with the new key"]
  C --> D["Wait for old tokens to expire"]
  D --> E["Remove the old key"]
```

## How do you rotate the key?

> [!WARNING]
> Do not remove the old key before step 6 is complete. Clients that hold a token from the old key then get a `401` error.

1. Create the new key. The command prints the ID of the new key. This guide calls it `NEW_KEY_ID`.

   ```sh
   keyctl create --env prod --algorithm ed25519
   ```

2. Add the new key to the key set.

   ```sh
   keyctl publish --env prod --key "$NEW_KEY_ID"
   ```

3. Wait 10 minutes. Clients keep a copy of the key set for up to 10 minutes.[^cache]
4. Make the new key the signing key.

   ```sh
   keyctl promote --env prod --key "$NEW_KEY_ID"
   ```

5. Watch the log for signature errors for 5 minutes. Press <kbd>Ctrl+C</kbd> to stop the log.

   ```sh
   keyctl logs --env prod --follow --filter signature
   ```

6. Wait 60 minutes. A token expires 60 minutes after the API signs it.
7. Remove the old key from the key set. `OLD_KEY_ID` is the ID that `keyctl status` showed before step 4.

   ```sh
   keyctl retire --env prod --key "$OLD_KEY_ID"
   ```

## How do you know the rotation worked?

- [ ] `keyctl status --env prod` shows `NEW_KEY_ID` as the signing key.
- [ ] The key set holds only the new key.
- [ ] The log shows no signature errors after step 7.
- [ ] The change record has the new key ID and the date.

The output of `keyctl status` after a good rotation looks like this:

<details>
<summary>Output of <code>keyctl status --env prod</code></summary>

```text
Environment:       prod
Signing key:       k-2026-11-a7f3
Algorithm:         ed25519
Created:           2026-11-14 09:12 UTC
Key set:
  k-2026-11-a7f3   active    signing
Retired keys:
  k-2026-05-19c2   retired   2026-11-14 10:41 UTC
Token lifetime:    60 minutes
Key set max age:   10 minutes
Last error:        none
```

</details>

## What do you do if a step fails?

Before step 7, make the old key the signing key again. Clients still accept it, because it is still in the key set.

```sh
keyctl promote --env prod --key "$OLD_KEY_ID"
```

After step 7, do not add the old key again. Create a new key and start at step 1.

[^cache]: The `Cache-Control` header of the key set sets this time.
