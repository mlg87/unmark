<!-- Example. Replace every value with facts from the source. -->

# Quickstart: the Example Invoices SDK for Node.js

The Example Invoices SDK is a TypeScript client for the Example Invoices API at `https://api.example.com/v1`.

## Requirements

- Node.js 20 or later
- An API key of the Example Invoices API

## Install

With npm:

```sh
npm install @example/invoices
```

With pnpm:

```sh
pnpm add @example/invoices
```

With Yarn:

```sh
yarn add @example/invoices
```

## Authenticate

The client reads your API key from the `apiKey` option. Put the key in the `API_KEY` environment variable, and keep it out of your code:

```sh
export API_KEY="<your API key>"
```

## Make your first call

Save this program as `first-invoice.mjs`. It creates an invoice and prints its ID and status:

```js
import { Invoices } from "@example/invoices";

const client = new Invoices({ apiKey: process.env.API_KEY });

const invoice = await client.invoices.create({
  customerId: "cus_41Lb",
  amountDue: 48000,
  currency: "usd",
  dueDate: "2026-12-01",
});

console.log(invoice.id, invoice.status);
```

Run it:

```sh
node first-invoice.mjs
```

The program prints:

```text
inv_7Hq2 draft
```

## Next steps

- [Reference](reference.md): every method of the client, its options, and its errors.
- [API overview](api/README.md): the base URL, authentication, and errors of the API that the SDK calls.
