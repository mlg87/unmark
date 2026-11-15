<!-- Example. Replace every value with facts from the source. -->

# Example Invoices SDK reference

The methods of the `Invoices` client in `@example/invoices`, version 2, for Node.js. Each method sends one request to the Example Invoices API and returns a promise.

## Client

### `new Invoices`

Creates a client.

```ts
new Invoices(options: ClientOptions)
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `options` | `ClientOptions` | None | The options of the client. See [Configuration](#configuration). |

Returns: an `Invoices` client.

| Error | When |
| --- | --- |
| `TypeError` | `options.apiKey` is missing. |

```ts
import { Invoices } from "@example/invoices";

const client = new Invoices({ apiKey: process.env.API_KEY });
```

## Invoices

### `invoices.create`

Creates an invoice with the status `draft`.

```ts
create(params: CreateInvoiceParams, options?: RequestOptions): Promise<Invoice>
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `params.customerId` | `string` | None | The ID of the customer who pays the invoice. |
| `params.amountDue` | `number` | None | The amount to pay, in the smallest unit of the currency. Minimum `50`. |
| `params.currency` | `string` | None | The three-letter ISO 4217 code of the currency, in lowercase. |
| `params.dueDate` | `string` | 30 days after creation | The date by which the customer must pay, as `YYYY-MM-DD`. |
| `options.idempotencyKey` | `string` | A new UUID | The key that makes a retry safe. |

Returns: `Promise<Invoice>`, the new invoice.

| Error | When |
| --- | --- |
| `InvalidRequestError` | A parameter is missing or not valid. |
| `NotFoundError` | No customer has the ID in `customerId`. |

```ts
const invoice = await client.invoices.create({
  customerId: "cus_41Lb",
  amountDue: 48000,
  currency: "usd",
  dueDate: "2026-12-01",
});
```

### `invoices.retrieve`

Returns one invoice.

```ts
retrieve(id: string, options?: RequestOptions): Promise<Invoice>
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `string` | None | The ID of the invoice. |

Returns: `Promise<Invoice>`.

| Error | When |
| --- | --- |
| `NotFoundError` | No invoice has this ID. |

```ts
const invoice = await client.invoices.retrieve("inv_7Hq2");
```

### `invoices.list`

Returns every invoice that matches the filters, newest first. The iterator gets each next page when it needs it. See [Pagination](#pagination).

```ts
list(params?: ListInvoicesParams, options?: RequestOptions): AsyncIterable<Invoice>
```

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `params.status` | `"draft" \| "open" \| "paid" \| "void"` | None | Return only invoices with this status. |
| `params.customerId` | `string` | None | Return only the invoices of this customer. |
| `params.limit` | `number` | `10` | The number of invoices in each page that the iterator gets. Maximum `50`. |

Returns: `AsyncIterable<Invoice>`.

| Error | When |
| --- | --- |
| `InvalidRequestError` | `params.limit` is more than `50`. |

```ts
for await (const invoice of client.invoices.list({ status: "open" })) {
  console.log(invoice.id);
}
```

## Configuration

`ClientOptions` has these options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | `string` | None | Your API key. Required. |
| `baseURL` | `string` | `"https://api.example.com/v1"` | The URL that every request starts with. |
| `timeout` | `number` | `30000` | The time in milliseconds to wait for a response. |
| `maxRetries` | `number` | `2` | The number of times the client sends a failed request again. |

## Errors and retries

Each error class extends `InvoicesError`, which has `status`, `code`, and `message`.

| Error | Status | When |
| --- | --- | --- |
| `InvalidRequestError` | `400` | A parameter is missing or not valid. |
| `AuthenticationError` | `401` | The API key is missing or not valid. |
| `NotFoundError` | `404` | No object has the ID. |
| `RateLimitError` | `429` | The API key sent too many requests. |
| `APIError` | `500` | The API failed. |

The client sends a request again after a `429`, a `500`, or a network error, up to `maxRetries` times. It waits 0.5 seconds before the first retry, and doubles the wait before each next retry. After a `429`, it waits for the time in the `Retry-After` header.

## Pagination

`invoices.list` returns an `AsyncIterable`. A `for await` loop reads every invoice, and the client gets each next page when the loop needs it. To read one page only, stop the loop after `params.limit` invoices.

## Versioning

The major version of the SDK changes when a method changes in a way that breaks code that calls it. Version 2 of the SDK calls version `v1` of the API.

## Migrate from 1.x

`invoices.list` returns an iterator, not an array:

```diff
- const invoices = await client.invoices.list({ limit: 10 });
- for (const invoice of invoices) {
+ for await (const invoice of client.invoices.list({ limit: 10 })) {
    console.log(invoice.id);
  }
```
