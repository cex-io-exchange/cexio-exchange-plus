/**
 * @typedef RestOptions
 * @type {Object}
 * @property {number=} apiLimit - Rate limit value for apiKey. Default is 300.
 * @property {number=} timeout - Request timeout in milliseconds. Default is 30000.
 * @property {boolean=} rejectUnauthorized - This option useful when you test demo env, default is true.
 * @property {string=} host - Can be changed to test your bot on demo environment.
 *   Default is 'https://api.plus.cex.io/'
 * @property {string=} apiUrlPublic - Use a concrete url for public API calls. This option overrides `host` value.
 *   Default is 'https://api.plus.cex.io/rest-public/'
 * @property {string=} apiUrl - Use a concrete url for private API calls. This option overrides `host` value.
 *   Default is 'https://api.plus.cex.io/rest/'
 * @property {function=} log - Function for logging client info
 */

export type RestOptions = {
  apiLimit: number,
  timeout: number,
  rejectUnauthorized: boolean,
  host: string,
  apiUrlPublic: string,
  apiUrl: string,
  log: (...logging: any) => void
}

/**
 * @typedef WebSocketOptions
 * @type {Object}
 * @property {number=} wsReplyTimeout - Request timeout in milliseconds. Default is 30000.
 * @property {boolean=} rejectUnauthorized - This option useful when you test demo env. Default is true.
 * @property {string=} host - Can be changed to test your bot on demo environment.
 *   Default is 'wss://api.plus.cex.io/'
 * @property {string=} apiUrlPublic - Use a concrete url for public WS calls. This option overrides `host` value.
 *   Default is 'wss://api.plus.cex.io/ws-public/'
 * @property {string=} host - Use a concrete url for private WS calls. This option overrides `host` value.
 *   Default is 'wss://api.plus.cex.io/ws/'
 * @property {function=} log - Function for logging client info
 */

export type WebSocketOptions = {
  wsReplyTimeout: number,
  rejectUnauthorized: boolean,
  host: string,
  apiUrlPublic: string,
  apiUrl: string,
  log: (...logging: any) => void
}