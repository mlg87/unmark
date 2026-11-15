<!-- Example. Replace every value with facts from the source. -->

# Invoices

An invoice is a request for payment that you send to a customer. This page gives the invoice object, its endpoints, and the `invoice.paid` webhook. The [overview](README.md) gives the base URL, authentication, and the errors that every endpoint can return.

## The invoice object

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | The ID of the invoice, such as `inv_7Hq2`. |
| `object` | string | Always `invoice`. |
| `customer_id` | string | The ID of the customer who pays the invoice. |
| `amount_due` | integer | The amount to pay, in the smallest unit of the currency. |
| `currency` | string | The three-letter ISO 4217 code of the currency, in lowercase, such as `usd`. |
| `status` | string | `draft`, `open`, `paid`, or `void`. |
| `due_date` | string (date) | The date by which the customer must pay, such as `2026-12-01`. |
| `created_at` | string (date-time) | When the invoice was created. |

## Create an invoice

`POST /invoices`

Creates an invoice with the status `draft`.

### Headers

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `Idempotency-Key` | string | No | A unique key that makes a retry safe. See [Idempotency](README.md#idempotency). |

### Request body

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `customer_id` | string | Yes | The ID of the customer who pays the invoice. |
| `amount_due` | integer | Yes | The amount to pay, in the smallest unit of the currency. Minimum `50`. |
| `currency` | string | Yes | The three-letter ISO 4217 code of the currency, in lowercase. |
| `due_date` | string (date) | No | The date by which the customer must pay. Default: 30 days after the invoice is created. |

### Example request

```sh
curl https://api.example.com/v1/invoices \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "cus_41Lb", "amount_due": 48000, "currency": "usd", "due_date": "2026-12-01"}'
```

### Responses

#### 201 Created

The API created the invoice.

```json
{
  "id": "inv_7Hq2",
  "object": "invoice",
  "customer_id": "cus_41Lb",
  "amount_due": 48000,
  "currency": "usd",
  "status": "draft",
  "due_date": "2026-12-01",
  "created_at": "2026-11-02T09:30:00Z"
}
```

### Errors

| Status | Code | When |
| --- | --- | --- |
| `400` | `invalid_request` | A required field is missing, or a value is not valid. |
| `404` | `customer_not_found` | No customer has the ID in `customer_id`. |
| `409` | `idempotency_conflict` | An earlier request used the same `Idempotency-Key` with a different body. |

## Get an invoice

`GET /invoices/{invoice_id}`

Returns one invoice.

### Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `invoice_id` | string | Yes | The ID of the invoice. |

### Example request

```sh
curl https://api.example.com/v1/invoices/inv_7Hq2 \
  -H "Authorization: Bearer $API_KEY"
```

### Responses

#### 200 OK

The invoice.

```json
{
  "id": "inv_7Hq2",
  "object": "invoice",
  "customer_id": "cus_41Lb",
  "amount_due": 48000,
  "currency": "usd",
  "status": "open",
  "due_date": "2026-12-01",
  "created_at": "2026-11-02T09:30:00Z"
}
```

### Errors

| Status | Code | When |
| --- | --- | --- |
| `404` | `invoice_not_found` | No invoice has this ID. |

## List invoices

`GET /invoices`

Returns a page of invoices, newest first. See [Pagination](README.md#pagination).

### Query parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | No | Return only invoices with this status: `draft`, `open`, `paid`, or `void`. |
| `customer_id` | string | No | Return only the invoices of this customer. |
| `limit` | integer | No | The number of invoices on the page. Default `10`. Maximum `50`. |
| `starting_after` | string | No | The ID of the last invoice on the previous page. |

### Example request

```sh
curl "https://api.example.com/v1/invoices?status=open&limit=2" \
  -H "Authorization: Bearer $API_KEY"
```

### Responses

#### 200 OK

A page of invoices.

```json
{
  "data": [
    {
      "id": "inv_7Hq2",
      "object": "invoice",
      "customer_id": "cus_41Lb",
      "amount_due": 48000,
      "currency": "usd",
      "status": "open",
      "due_date": "2026-12-01",
      "created_at": "2026-11-02T09:30:00Z"
    }
  ],
  "has_more": false
}
```

### Errors

| Status | Code | When |
| --- | --- | --- |
| `400` | `invalid_request` | `limit` is more than `50`, or `status` is not one of the four values. |

## Send an invoice

`POST /invoices/{invoice_id}/send`

Changes the status of a `draft` invoice to `open`, and emails it to the customer.

### Path parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `invoice_id` | string | Yes | The ID of the invoice. |

### Example request

```sh
curl -X POST https://api.example.com/v1/invoices/inv_7Hq2/send \
  -H "Authorization: Bearer $API_KEY"
```

### Responses

#### 200 OK

The invoice, with the status `open`.

```json
{
  "id": "inv_7Hq2",
  "object": "invoice",
  "customer_id": "cus_41Lb",
  "amount_due": 48000,
  "currency": "usd",
  "status": "open",
  "due_date": "2026-12-01",
  "created_at": "2026-11-02T09:30:00Z"
}
```

### Errors

| Status | Code | When |
| --- | --- | --- |
| `404` | `invoice_not_found` | No invoice has this ID. |
| `409` | `invoice_not_draft` | The status of the invoice is not `draft`. |

## ~~Finalize an invoice~~

`POST /invoices/{invoice_id}/finalize`

Deprecated. Use [Send an invoice](#send-an-invoice), which also emails the invoice. This endpoint changes the status of a `draft` invoice to `open`, and sends no email.

## Webhook: `invoice.paid`

The API sends this event when the status of an invoice changes to `paid`. It sends a `POST` request with a JSON body to the webhook URL of your account.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | The ID of the event, such as `evt_3Kd9`. |
| `type` | string | Always `invoice.paid`. |
| `created_at` | string (date-time) | When the event happened. |
| `data` | `Invoice` | The invoice, as [the invoice object](#the-invoice-object) gives it. |

```json
{
  "id": "evt_3Kd9",
  "type": "invoice.paid",
  "created_at": "2026-11-20T14:05:00Z",
  "data": {
    "id": "inv_7Hq2",
    "object": "invoice",
    "customer_id": "cus_41Lb",
    "amount_due": 48000,
    "currency": "usd",
    "status": "paid",
    "due_date": "2026-12-01",
    "created_at": "2026-11-02T09:30:00Z"
  }
}
```

### Verify the signature

The `Example-Signature` header holds `t`, the time of the request in Unix seconds, and `v1`, the signature: `t=1763647500,v1=9f2c…`.

1. Join the value of `t`, a `.`, and the raw body of the request.
2. Compute an HMAC with SHA-256 of that text. Use the webhook secret of your account as the key.
3. Compare the result with `v1` in constant time. If they differ, reject the request.
4. If `t` is more than 5 minutes old, reject the request.

### Retries

Respond with a `2xx` status within 10 seconds. If the API gets another status, or no response, it sends the event again up to 5 times: after 1 minute, 10 minutes, 1 hour, 6 hours, and 24 hours.
