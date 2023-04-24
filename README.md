# CEX.IO Exchange Plus

The official Node.js client for CEX.IO Exchange Plus API (https://docs.plus.cex.io)

## Features

- Easy to use, requires only key-secret pair to setup
- Handle all transport work, just call required action
- Popular protocols supported, REST and WebSocket onboard

## Installation

```bash
npm install cexio-exchange-plus
```

## Rest client

```js
const { RestClient } = require('cexio-exchange-plus')
const defaultClient = new RestClient()
const authenticatedClient = new RestClient(apiKey, apiSecret, options)
```

Arguments for RestClient are optional. For private actions you need to obtain apiKey + apiSecret pair from your manager.

- `apiKey` _string_ - Api key for specific account.
- `apiSecret` _string_ - Api secret for specific account.
- `options` _object_ - Additional settings for client.

Available client options described below, they all are optional:

- `apiLimit` _integer_ - Rate limit value for apiKey, default is 300.
  Client will check requests count and prevent from spam the server. You can ask to increase this limit.
- `timeout` _integer_ - Request timeout in milliseconds, default is 30000.
- `rejectUnauthorized` _boolean_ - This option useful when you test demo env, default is true.
- `host` _string_ - Can be changed to test your bot on demo environment.
  default is 'https://api.plus.cex.io/'


### Public actions

To make a public request use `async callPublic(action, params)` method.
This method return `Promise` which resolves with server response.
If some error was occurred then method rejects with status code and error description.

For more details check [api reference](https://docs.plus.cex.io).

```js
const { RestClient } = require('cexio-exchange-plus')

const client = new RestClient()

try {
  const res = await client.callPublic('get_ticker')
  console.log(res)
} catch (err) {
  console.log(err)
}
```

```js
{ error: 'Bad Request', statusCode: 400 }
{ error: 'Unexpected error', statusCode: 500 }
```

### Private actions

To make private api calls use `async callPrivate(action, params)`. It's similar to public method but requires `apiKey` and `apiSecret` arguments to client initialization. Each private request is signed with `HMAC sha256` so if key is incorrect or signature is wrong client will return rejected promise with error like this `{ error: 'Authorization Failed', statusCode: 401 }`

```js
const { RestClient } = require('cexio-exchange-plus')

const key = '_account_api_key_'
const secret = '_account_api_secret_'
const action = 'get_my_orders'
const params = {
  pair: 'BTC-USD'
}

const client = new RestClient(key, secret)

try {
  const res = await client.callPrivate(action, params)
  console.log(res)
} catch (err) {
  console.error(err)
}
```

Success response example:

```js
{ ok: 'ok', data: { ... } }
```

## WebSocket client

```js
const { WebsocketClient } = require('cexio-exchange-plus')
const ws = new WebsocketClient(apiKey, apiSecret, options)
```

To init the WebsocketClient you must pass `apiKey` and `apiSecret` arguments. You can obtain them from your manager.

- `apiKey` _string_ - Api key for specific account.
- `apiSecret` _string_ - Api secret for specific account.
- `options` _object_ - Additional settings for client.

Available client options described below, they all are optional:

- `wsReplyTimeout` _integer_ - Request timeout in milliseconds, default is 30000.
- `rejectUnauthorized` _boolean_ - This option useful when you test demo env, default is true.
- `host` _string_ - Can be changed to test your bot on demo environment.
  default is 'wss://api.plus.cex.io/'


### Call Private actions
To send request to the server you need to connect and auth first. Everything is under the hood and all you need is call `async ws.connect()` method. After that you can invoke `async ws.callPrivate(action, params)` method which returns `Promise` with server response.
If some error was occurred then method rejects with status code and error description.

```js
  const { WebsocketClient } = require('cexio-exchange-plus')
  const ws = new WebsocketClient(apiKey, apiSecret, options)

  await ws.connect() // connect and auth on the server

  const res = await ws.callPrivate(action, params)
  console.log('result:', res)

  ws.disconnect() // close connection
```

### Subscribe to updates
The WebsocketClient allows you to receive updates. At the now available two types of updates `account_update` and `executionReport`. You can get more details about them in [documentation](https://docs.plus.cex.io/#websocket-private-api-calls-account-events).

```js
const { WebsocketClient } = require('cexio-exchange-plus')
const ws = new WebsocketClient(apiKey, apiSecret)

try {
  await ws.connect()

  ws.subscribe('executionReport', msg => {
    console.log('executionReport:', msg)
  })

  ws.subscribe('account_update', msg => {
    console.log('account_update:', msg)
  })
} catch (err) {
  console.error(err)
}
```