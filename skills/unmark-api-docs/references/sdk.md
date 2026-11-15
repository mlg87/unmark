# Document an SDK

An SDK reference has a quickstart page and a reference page. The quickstart gets a new user to one working call. The reference gives every public function and method. See [`../assets/sdk-quickstart.md`](../assets/sdk-quickstart.md) and [`../assets/sdk-reference.md`](../assets/sdk-reference.md) for complete pages.

Signatures, parameter names, types, and defaults come from the source: the type definitions, the exported functions, and their comments. Never guess one. A method that the package does not export is not part of the reference.

## Default layout

Use this layout only when the repository has no SDK documentation to copy:

- `docs/quickstart.md`: the quickstart page.
- `docs/reference.md`: the reference page. With more than one class or module, use one page for each, such as `docs/reference/invoices.md`.

## Quickstart page

Write these parts in this order:

1. What the SDK is, in one sentence.
2. `## Requirements`: the runtime and each other requirement, with the lowest version that the source names, such as "Node.js 20 or later".
3. `## Install`: the install command for each package manager that the source names, each in an `sh` fence.
4. `## Authenticate`: where the client gets its credential. Use a placeholder such as `$API_KEY`.
5. `## Make your first call`: a complete program of at most 15 lines that a user can run as it is, then its expected output in a `text` fence.
6. `## Next steps`: links to the reference page and to the overview of the API.

## Reference page

Group the functions and methods by task, such as "Create and send invoices", or by class, such as `Invoices`. Use the grouping of the source when it has one. Give each function or method a `###` section:

1. The name as the heading, such as `` ### `invoices.create` ``.
2. One sentence on what it does.
3. The signature in a fence of the SDK's language, copied from the source.
4. A parameters table with the columns `Name`, `Type`, `Default`, and `Description`. Write `None` in `Default` for a required parameter. For an options object, give each option a row, such as `options.limit`.
5. What it returns, with its type.
6. An errors table with the columns `Error` and `When`, with the error classes that the source throws or raises.
7. An example in a fence of the SDK's language.

After the functions, give these parts when the source has them:

- `## Configuration`: a table of the client options with the columns `Option`, `Type`, `Default`, and `Description`.
- `## Errors and retries`: the error classes, the errors the client retries, how many times, and with what wait.
- `## Pagination`: the helper that reads every page, such as an iterator.
- `## Versioning`: how the SDK's version relates to the API's version.
- `## Migrate from <old version>`: each change in a `diff` fence.

````markdown
## Migrate from 1.x

`invoices.list` now returns an iterator, not an array.

```diff
- const invoices = await client.invoices.list({ limit: 10 });
+ for await (const invoice of client.invoices.list({ limit: 10 })) {
+   console.log(invoice.id);
+ }
```
````

## Several languages

When the SDK has several languages, give the same example in each language, in the same order on every page.

- With two languages, put one fence after the other. Introduce each fence with the language's name, such as "In TypeScript:".
- With more than two, give each language one `<details>` block. The `<summary>` is the language's name. GitHub-flavored markdown has no tabs, and `<details>` is the nearest element.

````markdown
<details>
<summary>TypeScript</summary>

```ts
const invoice = await client.invoices.retrieve("inv_7Hq2");
```

</details>

<details>
<summary>Python</summary>

```python
invoice = client.invoices.retrieve("inv_7Hq2")
```

</details>

<details>
<summary>Go</summary>

```go
invoice, err := client.Invoices.Retrieve(ctx, "inv_7Hq2")
```

</details>
````

## Check

- [ ] Each public function and method in the source has one section, and each section has a function or method in the source.
- [ ] Each signature, parameter name, type, and default is copied from the source.
- [ ] The first call has at most 15 lines and runs as it is.
- [ ] Each install command names a package that the source names.
- [ ] Each migration change is in a `diff` fence.
