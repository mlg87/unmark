<!-- Example. Replace every value with facts from the source. -->

# Invoices

The queries, mutations, and subscriptions of the Example Invoices API for invoices, and their types. Send each operation to `https://api.example.com/v1/graphql`. The [overview](README.md) gives authentication, pagination, and errors.

## Queries

### invoice

Returns one invoice by its ID.

```graphql
type Query {
  invoice(id: ID!): Invoice
}
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `ID!` | None | The ID of the invoice. |

Returns: [`Invoice`](#invoice-1), or `null` when no invoice has the ID.

Query:

```graphql
query GetInvoice($id: ID!) {
  invoice(id: $id) {
    id
    amountDue
    currency
    status
  }
}
```

Variables:

```json
{ "id": "inv_7Hq2" }
```

Response:

```json
{
  "data": {
    "invoice": {
      "id": "inv_7Hq2",
      "amountDue": 48000,
      "currency": "usd",
      "status": "OPEN"
    }
  }
}
```

### invoices

Returns a page of invoices, newest first. See [Pagination](README.md#pagination).

```graphql
type Query {
  invoices(first: Int = 10, after: String, status: InvoiceStatus): InvoiceConnection!
}
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `first` | `Int` | `10` | The number of invoices on the page. Maximum `50`. |
| `after` | `String` | None | The cursor after which the page starts. |
| `status` | [`InvoiceStatus`](#invoicestatus) | None | Return only invoices with this status. |

Returns: [`InvoiceConnection!`](#invoiceconnection).

Query:

```graphql
query ListInvoices($first: Int, $status: InvoiceStatus) {
  invoices(first: $first, status: $status) {
    edges {
      cursor
      node {
        id
        amountDue
        status
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

Variables:

```json
{ "first": 1, "status": "OPEN" }
```

Response:

```json
{
  "data": {
    "invoices": {
      "edges": [
        {
          "cursor": "Y3Vyc29yOjE=",
          "node": { "id": "inv_7Hq2", "amountDue": 48000, "status": "OPEN" }
        }
      ],
      "pageInfo": { "hasNextPage": true, "endCursor": "Y3Vyc29yOjE=" }
    }
  }
}
```

## Mutations

### createInvoice

Creates an invoice with the status `DRAFT`.

```graphql
type Mutation {
  createInvoice(input: CreateInvoiceInput!): Invoice!
}
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `input` | [`CreateInvoiceInput!`](#createinvoiceinput) | None | The fields of the new invoice. |

Returns: [`Invoice!`](#invoice-1), the new invoice.

Query:

```graphql
mutation CreateInvoice($input: CreateInvoiceInput!) {
  createInvoice(input: $input) {
    id
    status
    dueDate
  }
}
```

Variables:

```json
{
  "input": {
    "customerId": "cus_41Lb",
    "amountDue": 48000,
    "currency": "usd",
    "dueDate": "2026-12-01"
  }
}
```

Response:

```json
{
  "data": {
    "createInvoice": {
      "id": "inv_7Hq2",
      "status": "DRAFT",
      "dueDate": "2026-12-01"
    }
  }
}
```

## Subscriptions

### invoicePaid

Sends an event each time the status of an invoice changes to `PAID`.

```graphql
type Subscription {
  invoicePaid(customerId: ID): Invoice!
}
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `customerId` | `ID` | None | Send events only for the invoices of this customer. |

Returns: [`Invoice!`](#invoice-1), the paid invoice.

Query:

```graphql
subscription OnInvoicePaid($customerId: ID) {
  invoicePaid(customerId: $customerId) {
    id
    status
  }
}
```

Variables:

```json
{ "customerId": "cus_41Lb" }
```

Event:

```json
{
  "data": {
    "invoicePaid": { "id": "inv_7Hq2", "status": "PAID" }
  }
}
```

## Types

### Invoice

| Field | Type | Description |
| --- | --- | --- |
| `id` | `ID!` | The ID of the invoice. |
| `customerId` | `ID!` | The ID of the customer who pays the invoice. |
| `amountDue` | `Int!` | The amount to pay, in the smallest unit of the currency. |
| `currency` | `String!` | The three-letter ISO 4217 code of the currency, in lowercase. |
| `status` | [`InvoiceStatus!`](#invoicestatus) | The status of the invoice. |
| `dueDate` | `String` | The date by which the customer must pay, as `YYYY-MM-DD`. |
| ~~`total`~~ | `Int` | Deprecated: "Use amountDue." The field returns the same value as `amountDue`. |

### InvoiceStatus

| Value | Description |
| --- | --- |
| `DRAFT` | The invoice is not sent yet. |
| `OPEN` | The invoice is sent and not paid. |
| `PAID` | The customer paid the invoice. |
| `VOID` | The invoice was canceled. |

### CreateInvoiceInput

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `customerId` | `ID!` | None | The ID of the customer who pays the invoice. |
| `amountDue` | `Int!` | None | The amount to pay, in the smallest unit of the currency. Minimum `50`. |
| `currency` | `String!` | None | The three-letter ISO 4217 code of the currency, in lowercase. |
| `dueDate` | `String` | None | The date by which the customer must pay, as `YYYY-MM-DD`. |

### InvoiceConnection

A page of invoices. See [Pagination](README.md#pagination).

| Field | Type | Description |
| --- | --- | --- |
| `edges` | [`[InvoiceEdge!]!`](#invoiceedge) | The invoices on the page. |
| `pageInfo` | `PageInfo!` | Whether another page follows, and the cursor to get it. |

### InvoiceEdge

| Field | Type | Description |
| --- | --- | --- |
| `cursor` | `String!` | The cursor of this invoice. Send it as `after` to start the next page after it. |
| `node` | [`Invoice!`](#invoice-1) | The invoice. |
