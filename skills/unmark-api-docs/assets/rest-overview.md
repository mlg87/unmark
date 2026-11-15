<!-- Example. Replace every value with facts from the source. -->

# Example Invoices API

The Example Invoices API creates invoices, sends them to customers, and records their payment.

## Base URL

Every path in this reference starts at this URL:

```text
https://api.example.com/v1
```

## Authentication

Send your API key as a bearer token in the `Authorization` header of every request:

```sh
curl https://api.example.com/v1/invoices \
  -H "Authorization: Bearer $API_KEY"
```

A request with no key, or with a key that is not valid, gets the status `401` and the error code `authentication_failed`.

## Versioning

The version is the first part of the path, `/v1`. A change in `v1` only adds endpoints, fields, or enum values. A change that removes or renames a field gets a new version.

## Requests and responses

- A request body and a response body are JSON, encoded as UTF-8. Send `Content-Type: application/json` with a request body.
- A date and time is a string in ISO 8601 format in UTC, such as `2026-11-02T09:30:00Z`.
- An amount is an integer in the smallest unit of its currency. `48000` in `usd` is 480.00 US dollars.
- An ID is a string with a prefix for its resource, such as `inv_7Hq2` for an invoice.

## Pagination

A list endpoint returns one page of objects, newest first:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer | No | The number of objects on the page. Default `10`. Maximum `50`. |
| `starting_after` | string | No | The ID of the last object on the previous page. The page starts after it. |

The response holds the objects in `data`, and `has_more` is `true` when another page follows:

```json
{
  "data": [
    { "id": "inv_7Hq2", "object": "invoice" }
  ],
  "has_more": true
}
```

To get the next page, send the ID of the last object in `data` as `starting_after`.

## Rate limits

Each API key can send 25 requests a second. A request over the limit gets the status `429` and the error code `rate_limited`. The `Retry-After` header gives the number of seconds to wait before the next request.

## Errors

An error response has an `error` object with a `code` and a `message`:

```json
{
  "error": {
    "code": "invoice_not_found",
    "message": "No invoice has the ID inv_9Zz0."
  }
}
```

Every endpoint can return these errors:

| Status | Code | When |
| --- | --- | --- |
| `401` | `authentication_failed` | The request has no API key, or the key is not valid. |
| `429` | `rate_limited` | The API key sent more than 25 requests in a second. |
| `500` | `internal_error` | The API failed. Send the request again later. |

Each endpoint lists its own errors in its section.

## Idempotency

Send an `Idempotency-Key` header with a `POST` request to make a retry safe. The API saves the response to the first request with a key for 24 hours. A second request with the same key gets the same response, and the API does not create a second object.

```sh
curl https://api.example.com/v1/invoices \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: 5f0c6a2e-8d1b-4c3e-9a7f-2b6d1e4f8c90" \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "cus_41Lb", "amount_due": 48000, "currency": "usd"}'
```

## Resources

- [Invoices](invoices.md): create, get, list, and send invoices, and the `invoice.paid` webhook.
