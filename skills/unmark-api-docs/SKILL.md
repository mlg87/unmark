---
name: unmark-api-docs
description: Writes reference documentation for REST APIs, GraphQL APIs, and SDKs or client libraries in GitHub-flavored markdown. Covers endpoint and operation pages, parameter and field tables, request and response examples, authentication, errors, pagination, quickstarts, and method references. Use when asked to document an API, an endpoint, an OpenAPI or GraphQL schema, a webhook, or an SDK, package, or client library.
license: MIT
---

# Write API and SDK reference documentation

This skill writes the reference of a REST API, a GraphQL API, or an SDK. Each page has a fixed layout. One rule is above all the others: the documentation says only what the source says. An invented parameter, field, status code, or limit costs its reader hours, so a fact with no source stays out of the documentation.

## Steps

1. Decide what you document: a REST API, a GraphQL API, or an SDK. Read only that reference file:

   | You document | Reference file | Assets |
   | --- | --- | --- |
   | A REST API, an OpenAPI file, or a webhook | [`references/rest.md`](references/rest.md) | `rest-overview.md`, `rest-endpoint.md` |
   | A GraphQL API or a GraphQL schema | [`references/graphql.md`](references/graphql.md) | `graphql-operation.md` |
   | An SDK, a package, or a client library | [`references/sdk.md`](references/sdk.md) | `sdk-quickstart.md`, `sdk-reference.md` |

2. Find the source of truth, in this order:
   1. A machine-readable description: an OpenAPI file, a GraphQL schema or introspection result, or type definitions.
   2. The code: routes, handlers, resolvers, and exported functions and their comments.
   3. Existing documentation.
   4. What the user says.

   When two sources disagree, use the earlier one in this list. Report the difference in the reply.
3. List every operation in scope from the source. An operation is an endpoint, a query, a mutation, a subscription, a webhook, or a public function or method. The documentation covers each one and no other.
4. Use the layout of the repository's existing documentation: its folders, file names, and headings. If it has none, use the default layout in the reference file.
5. Write each page from the matching file in `assets/`. Choose each element with [`references/syntax.md`](references/syntax.md). Write the sentences with the rules in [`references/plain-language.md`](references/plain-language.md).
   - Keep the layout of the asset. Replace every name, value, and number in it with a fact from the source.
   - Each sentence of the asset is an example too, even one that sounds general. Keep a sentence only when the source states its fact, such as the format of an ID, the unit of an amount, or the name of the credential.
   - Leave out each part of the asset that the source does not show, such as pagination, rate limits, idempotency, webhooks, or a deprecated operation. Do not write that the API has none, because the source does not say that either.
6. Check every operation, parameter, field, type, default, limit, and status code against the source. Delete each one that the source does not give. Write `TBD` for a needed fact that the source lacks, and list every `TBD` in the reply.
7. Do "Show the result".

## Examples in the documentation

- An example can be copied and run. It holds every required parameter, header, and import.
- One set of example values runs through the whole document. The ID that a create request returns is the ID that a later get request uses.
- Take the values from the examples in the source when it has them.
- A secret is a placeholder such as `$API_KEY`, never a value from the environment or a configuration file.
- A response shows the shape the source defines: each field the source lists, with a value of its type. Add no field that the source does not list.
- Put each example in a fence with its language: `sh` for a shell command, `json` for JSON, `graphql` for GraphQL, and the SDK's language for code. Unmark does not highlight an `http` fence, so do not use one.

## Show the result

After you save the document, run `command -v unmark`. If the command exists, run `unmark <file>` one time, with the path of each file you wrote. Unmark then shows the rendered document to the user. Do not add `--wait`. If the command does not exist, skip this step and say nothing about it.

## References

- [`references/rest.md`](references/rest.md): read it at step 1 for a REST API. It gives the overview page, the endpoint section, the conventions, webhooks, and the default layout.
- [`references/graphql.md`](references/graphql.md): read it at step 1 for a GraphQL API. It gives the overview, the operation section, types, pagination, errors, and deprecation.
- [`references/sdk.md`](references/sdk.md): read it at step 1 for an SDK. It gives the quickstart page, the reference page, and the rules for several languages.
- [`references/syntax.md`](references/syntax.md): read it at step 5. It maps each kind of content to a markdown element, and gives the syntax and limits of each element.
- [`references/plain-language.md`](references/plain-language.md): read it at step 5. It gives the sentence and word rules, with examples.
- [`assets/rest-overview.md`](assets/rest-overview.md): the overview page of a REST API.
- [`assets/rest-endpoint.md`](assets/rest-endpoint.md): the page of one REST resource, with its endpoints and a webhook.
- [`assets/graphql-operation.md`](assets/graphql-operation.md): the page of the queries, mutations, and types of one GraphQL domain.
- [`assets/sdk-quickstart.md`](assets/sdk-quickstart.md): the quickstart page of an SDK.
- [`assets/sdk-reference.md`](assets/sdk-reference.md): the reference page of an SDK.

The five assets document one invented service, the Example Invoices API at `https://api.example.com/v1`, with one resource, `invoice`. Their names, values, and numbers are examples. Never copy them into a document.
