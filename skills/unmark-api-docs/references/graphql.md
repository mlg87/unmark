# Document a GraphQL API

A GraphQL reference has one overview page and one page for each domain of the schema. A domain is a group of operations and types about one thing, such as invoices. See [`../assets/graphql-operation.md`](../assets/graphql-operation.md) for a complete domain page.

Take every operation, argument, field, and type from the schema: a `.graphql` file, the type definitions in the code, or an introspection result. The terms follow <https://graphql.org/learn/>.

## Default layout

Use this layout only when the repository has no GraphQL documentation to copy:

- `docs/graphql/README.md`: the overview page, with pagination and errors.
- `docs/graphql/<domain>.md`: one page for each domain, such as `docs/graphql/invoices.md`, with its operations and its types.

## Overview page

- The endpoint: the URL, and the HTTP method that it accepts.
- Authentication: where the credential goes, with an example header.
- How to send a query: a `curl` command in an `sh` fence that posts `query` and `variables` as JSON, and the response in a `json` fence.
- `## Pagination`, when the schema has connections. See [Pagination](#pagination).
- `## Errors`. See [Errors](#errors).

## Operations

Group the operations under `## Queries`, `## Mutations`, and `## Subscriptions`, in that order. Leave out a group that the schema does not have. Give each operation a `###` section with these parts:

1. The operation name and its kind as the heading, such as `### invoice query`, `### createInvoice mutation`, or `### invoicePaid subscription`. See [Headings and links](#headings-and-links).
2. One sentence on what it does. Take it from the schema's description when it has one.
3. The signature in a `graphql` fence, copied from the schema.
4. An arguments table with the columns `Name`, `Type`, `Default`, and `Description`. Write the exact type from the schema, such as `ID!`, `[String!]`, or `InvoiceStatus`. Write `None` in `Default` for an argument with no default.
5. What it returns: the return type, with a link to the type.
6. An example: the query in a `graphql` fence, the variables in a `json` fence, and the response in a `json` fence.

```markdown
| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `first` | `Int` | `10` | The number of invoices to return. Maximum `50`. |
| `after` | `String` | None | The cursor after which the page starts. |
| `status` | `InvoiceStatus` | None | Return only invoices with this status. |
```

## Types

Put the types under `## Types`, after the operations. Give each type a `###` section with the type name and the word `type` as the heading, such as `### Invoice type` or `### InvoiceStatus type`:

- An object type gets a fields table with the columns `Field`, `Type`, and `Description`.
- An enum gets a values table with the columns `Value` and `Description`.
- An input type gets a fields table like an object type, with a `Default` column when an input field has a default.

Only `!` states that a value is never null. Write the type as the schema writes it, and do not add "always", "never null", or "optional" to the description of a field. A field of type `String` can be null, even when it usually has a value.

## Headings and links

A heading link uses the heading text in lowercase, so the query `invoice` and the type `Invoice` both get the link `#invoice`. The second heading then gets `#invoice-1`, and that link breaks when the sections move or the page is copied. The kind word in each heading prevents this: the query is `#invoice-query` and the type is `#invoice-type`.

- Link each type name to its section, such as `` [`Invoice!`](#invoice-type) ``.
- Do not write a link that ends in `-1`, `-2`, or another number that the heading does not have.

## Pagination

Document the connection model once, on the overview page. Link to it from each operation that returns a connection. A connection follows the model at <https://graphql.org/learn/pagination>:

- The arguments `first` and `after` select a page.
- The connection has `edges`. Each edge has a `node`, which is one item, and a `cursor`.
- `pageInfo` has `hasNextPage` and `endCursor`. To get the next page, send `endCursor` as `after`.

Document only the arguments and fields that the schema has. A schema with `first` and no `last` has no backward pagination.

## Errors

A GraphQL response can have an `errors` array. Say these facts once, on the overview page:

- Each error has a `message`, a `path` to the field that failed, and an `extensions.code` when the server sets one.
- `data` can be partial: one field can fail while the others return values. A client must check `errors` even when `data` is present.
- Give a table of the `extensions.code` values with the columns `Code` and `When`, but only the codes that the source names.

## Deprecation

A field, an argument, or an enum value with `@deprecated` is struck through, such as `~~number~~`. Its description gives the reason from the `@deprecated` directive and names the replacement.

## Check

- [ ] Each operation in the schema has one section, and each section has an operation in the schema.
- [ ] Each type is written exactly as the schema writes it, with each `!` and each `[ ]`.
- [ ] Each default comes from the schema.
- [ ] Each example query uses only fields and arguments from the schema.
- [ ] The connection model is documented once, and each paginated operation links to it.
- [ ] Each operation heading ends in `query`, `mutation`, or `subscription`, each type heading ends in `type`, and no link ends in `-1` or another added number.
