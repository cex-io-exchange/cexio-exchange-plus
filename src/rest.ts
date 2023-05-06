import { RestOptions } from './types/options';
import fetch, { RequestInit, Response } from 'node-fetch';
import crypto from 'crypto';
import https from 'https';

class RestClient {
  #apiKey?: string
  #apiSecret?: string
  #isPublicClient: boolean
  #requestCounter: number
  #lastMinute: number
  #options: RestOptions
  #httpsAgent: https.Agent

  /**
   * Create a new CEX.IO Exchange Plus REST client.
   * @constructor
   * @param {string=} apiKey client's api key
   * @param {string=} apiSecret client's api secret
   * @param {RestOptions=} options connection options
   */
  constructor (apiKey?: string, apiSecret?: string, options: Partial<RestOptions> = {}) {
    this.#apiKey = apiKey
    this.#apiSecret = apiSecret
    this.#isPublicClient = false
    this.#requestCounter = 0
    this.#lastMinute = this.#currentMinute()

    let _options = options
    if (arguments.length === 1) {
      _options = arguments[0]
      this.#isPublicClient = true
    }

    this.#options = {
      log: (unused: string) => {},
      apiLimit: 300,
      timeout: 30000,
      rejectUnauthorized: true,
      host: 'https://api.plus.cex.io/',
      // prepare the overridable values
      apiUrl: `${_options.host}rest/`,
      apiUrlPublic: `${_options.host}rest-public/`,

      ..._options
    }

    this.#httpsAgent = new https.Agent({
      rejectUnauthorized: this.#options.rejectUnauthorized,
      timeout: this.#options.timeout
    })

    if (!this.#options.host.endsWith('/')) {
      this.#options.host = `${this.#options.host}/`
    }

    if (!this.#options.apiUrl.endsWith('/')) {
      this.#options.apiUrl = `${this.#options.apiUrl}/`
    }

    if (!this.#options.apiUrlPublic.endsWith('/')) {
      this.#options.apiUrlPublic = `${this.#options.apiUrlPublic}/`
    }
  }

  /**
   * Call public api action
   * @param {string} action action name
   * @param {object} params action parameters
   * @returns Promise<Object>
   */
  callPublic (action: string, params = {}) {
    const headers = {
      'Content-type': 'application/json',
      'User-Agent': 'CEX.IO Exchange Plus Node Client'
    }
    return this.#request(action, params, headers, 'POST', true)
  }

  /**
   * Call private api action
   * @param {string} action action name
   * @param {object} params action parameters
   * @returns Promise<Object>
   */
  callPrivate (action: string, params = {}) {
    if (this.#isPublicClient) {
      throw new Error('Attempt to call private method on public client')
    }

    const timestamp = this.#unixTime()
    const signatureParams = JSON.stringify(params)
    const signature = this.#getSignature(action, timestamp, signatureParams)

    const headers = {
      'X-AGGR-KEY': this.#apiKey,
      'X-AGGR-TIMESTAMP': timestamp,
      'X-AGGR-SIGNATURE': signature,
      'Content-Type': 'application/json',
      'User-Agent': 'CEX.IO Exchange Plus Node Client'
    }

    return this.#request(action, params, headers, 'POST')
  }

  #unixTime () {
    return Math.floor(Date.now() / 1000)
  }

  #currentMinute () {
    return Math.floor(Date.now() / 60000)
  }

  #getSignature (action: string, timestamp: number, params: any) {
    const data = action + timestamp + params
    this.#options.log('signature params:', data)
    if (!this.#apiSecret) throw 'No apiSecret set'

    return crypto.createHmac('sha256', this.#apiSecret).update(data).digest('base64')
  }

  #limitReached () {
    const currentMinute = this.#currentMinute()
    if (currentMinute > this.#lastMinute) {
      this.#requestCounter = 0
      this.#lastMinute = currentMinute
    }
    return ++this.#requestCounter >= this.#options.apiLimit
  }

  async #request (
    action: string,
    body = {},
    headers = {},
    method = 'GET',
    isPublicRequest = false
  ) {
    if (this.#limitReached()) {
      throw new Error(
        'Internal API call rate limit reached.',
        // ignoring the following errors but the ctor isn't valid
        //@ts-ignore
        `Limit: ${this.#options.apiLimit}`
      )
    }

    const endpoint = isPublicRequest
      ? this.#options.apiUrlPublic
      : this.#options.apiUrl

    const url = method === 'GET'
      ? `${endpoint}${action}?${new URLSearchParams(body)}`
      : `${endpoint}${action}`

    const req: RequestInit = {
      method,
      headers,
      agent: this.#httpsAgent
    }

    if (method === 'POST') {
      req.body = JSON.stringify(body)
    }

    this.#options.log(`Request: ${method} ${url}, ${req.body && JSON.stringify(req.body)}`)

    try {
      const response = await fetch(url, req)
      const body = await response.json()

      this.#options.log(
        `Response: ${req.method} ${url},`,
        `statusCode: ${response.status},`,
        'body:', body
      )

      return this.#parseResponse(response, body)
    } catch (err) {
      this.#options.log(`Error: ${req.method} ${url}, err:`, err)
      throw err
    }
  }

  #parseResponse (response: Response, body: any) {
    if (response.status !== 200) {
      let errorObject

      if (typeof body === 'object') {
        errorObject = body
        errorObject.statusCode = response.status
      } else {
        errorObject = { statusCode: response.status, body }
      }

      throw errorObject
    }

    const result = body

    if (result.error) {
      throw result
    }

    return result
  }
}

export default RestClient;
