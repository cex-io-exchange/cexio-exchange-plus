import { Defer, Handlers, MessageOidReply } from './types/ws';
import { EventCallback, OnClose, OnError } from './types/callbacks';
import WebSocket from 'ws';
import crypto from 'crypto';
import { WebSocketOptions } from './types/options';

class WebsocketClient {
  #apiKey?: string
  #apiSecret?: string
  #oidSeqId
  #handlers: Handlers
  #waitForResp
  #waitTimers
  #isAuthorized
  #isPublicClient
  #options: WebSocketOptions
  #socket?: WebSocket

  /**
   * Create a new CEX.IO Exchange Plus WebSocket client.
   * @constructor
   * @param {string=} apiKey client's api key
   * @param {string=} apiSecret client's api secret
   * @param {WebSocketOptions=} options connection options
   */
  constructor (apiKey?: string, apiSecret?: string, options: Partial<WebSocketOptions> = {}) {
    this.#apiKey = apiKey
    this.#apiSecret = apiSecret

    this.#oidSeqId = 0
    this.#handlers = {}
    this.#waitForResp = {}
    this.#waitTimers = {}
    this.#isAuthorized = false
    this.#isPublicClient = false

    let _options = options
    if (arguments.length === 1) {
      _options = arguments[0]
      this.#isPublicClient = true
    }

    this.#options = {
      log: () => {},
      wsReplyTimeout: 30000,
      rejectUnauthorized: true,
      host: 'wss://api.plus.cex.io/',
      // prepare the overridable values
      apiUrl: `${options.host}ws`,
      apiUrlPublic: `${options.host}ws-public`,

      ..._options
    }

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
   * Establish connection to server and add handlers
   * @param {function=} onClose callback on socket close
   * @param {function=} onError callback on socket error
   */
  connect (onClose: OnClose, onError: OnError): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = this.#isPublicClient
        ? this.#options.apiUrlPublic
        : this.#options.apiUrl

      this.#options.log('connecting to:', endpoint)

      this.#socket = new WebSocket(
        endpoint,
        undefined,
        { rejectUnauthorized: this.#options.rejectUnauthorized }
      )

      this.#addHandler('disconnected', () => {
        this.#isAuthorized = false
        this.#cancelAllOidReplies('disconnected from server')
      })

      this.#addHandler('connected', async () => {
        try {
          if (!this.#isPublicClient) {
            await this.#auth()
          }
          resolve()
        } catch (err) {
          reject(err)
        }
      })

      this.#socket.on('message', this.#handleMessage.bind(this))

      this.#socket.on('close', (err?: Error) => {
        this.#socket = undefined
        this.#isAuthorized = false
        this.#cancelAllOidReplies(err)
        reject(err)
        if (onClose) onClose(err)
      })

      this.#socket.on('error', (err: Error) => {
        this.#socket = undefined
        this.#cancelAllOidReplies(err)
        reject(err)
        if (onError) onError(err)
      })
    })
  }

  /**
   * Close connection to api server
   */
  disconnect () {
    if (this.#socket && this.#socket.readyState === WebSocket.OPEN) {
      this.#socket.close()
    }
  }

  #createSignature (timestamp: number) {
    const data = `${timestamp}${this.#apiKey}`
    this.#options.log('signature params:', data)
    if (!this.#apiSecret) throw 'No apiSecret set'

    return crypto.createHmac('sha256', this.#apiSecret).update(data).digest('hex')
  }

  #auth (): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
        return reject(new Error('Client is not connected'))
      }

      this.#addHandler('auth', (authRes) => {
        if (authRes.data.ok && authRes.data.ok === 'ok') {
          this.#isAuthorized = true
          resolve()
        } else {
          reject(new Error(`Authorization failure: ${authRes.data.error}`))
        }
      })

      const timestamp = Date.now() / 1000

      const authRequest = JSON.stringify({
        e: 'auth',
        auth: {
          key: this.#apiKey,
          signature: this.#createSignature(timestamp),
          timestamp: timestamp
        },
        oid: 'auth'
      })

      this.#socket.send(authRequest, (err) => {
        if (err) reject(err)
      })
    })
  }

  #handleMessage (dataStr: string) {
    const message = JSON.parse(dataStr)
    this.#options.log('incoming message:', message)

    if (this.#handlers[message.e]) {
      this.#handlers[message.e](message)
    } else if (message.oid) {
      this.#handleOidReply(message)
    } else {
      if (message.e === 'pong') return
      this.#options.log('Ignoring ws message because of unknown message format', message)
    }
  }

  #handleOidReply (message: MessageOidReply) {
    if (this.#waitForResp[message.oid] === undefined) {
      this.#options.log(
        'Got message from server with oid but without handler on client side.',
        message,
        'Response handlers:',
        Object.keys(this.#waitForResp)
      )
      return
    }

    const p = this.#waitForResp[message.oid]
    delete this.#waitForResp[message.oid]
    clearTimeout(this.#waitTimers[message.oid])

    if (message.ok === 'ok') {
      p.resolve(message.data)
    } else {
      p.reject(message.data.error)
    }
  }

  #cancelAllOidReplies (err?: Error|string) {
    Object.keys(this.#waitForResp).forEach(oid => {
      this.#waitForResp[oid].reject({
        oid,
        error: err || 'connection closed',
        unexpectedError: true
      })
      delete this.#waitForResp[oid]
      clearTimeout(this.#waitTimers[oid])
    })
  }

  #cancelOidReply (oid: string, reason: string) {
    if (this.#waitForResp[oid]) {
      this.#waitForResp[oid].reject({
        oid,
        error: reason,
        unexpectedError: true
      })
      delete this.#waitForResp[oid]
    }
    if (this.#waitTimers[oid]) {
      clearTimeout(this.#waitTimers[oid])
    }
  }

  /**
   * Subscribe to events about account or order updates
   * @param {string} event account_update || executionReport || order_book_subscribe || etc.
   * @param {function} callback function to receive updates messages
   */
  subscribe (event: string, callback: EventCallback) {
    this.#addHandler(event, callback)
  }

  #addHandler (event: string, callback: EventCallback) {
    this.#handlers[event] = callback
  }

  /**
   * Create a defer holder. Currently accepting anything but for validation, will need
   * type validation and check up
   * 
   * @returns a defer holder
   */
  #getDefer (): Defer<any> {
    const defer: any = {}
    defer.promise = new Promise((resolve, reject) => {
      defer.resolve = resolve
      defer.reject = reject
    })
    return defer
  }

  /**
   * Send ping message
   * @returns {Promise<void>}
   */
  async ping () {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    this.#socket.send('{"e": "ping"}')
  }

  /**
   * Call public api method
   * @param {string} method method name
   * @param {object} params method parameters
   * @returns Promise<Object>
   */
  async callPublic (method: string, params = {}) {
    if (!this.#isPublicClient) {
      throw new Error('Attempt to call public method on private client')
    }

    return this.#callRequest(method, params)
  }

  /**
   * Call private api method
   * @param {string} method method name
   * @param {object} params method parameters
   * @returns Promise<Object>
   */
  async callPrivate (method: string, params = {}) {
    if (this.#isPublicClient) {
      throw new Error('Attempt to call private method on public client')
    }

    if (!this.#isAuthorized) {
      throw new Error('Not authorized')
    }

    return this.#callRequest(method, params)
  }

  async #callRequest (method: string, params = {}) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    const oid = `${Date.now()}${++this.#oidSeqId}_${method}`
    this.#waitForResp[oid] = this.#getDefer()

    // reject after some timeout if no response received
    this.#waitTimers[oid] = setTimeout(
      () => this.#cancelOidReply(oid, 'request timeout'),
      this.#options.wsReplyTimeout
    )

    const msg = JSON.stringify({
      e: method,
      data: params,
      oid: oid
    })

    this.#options.log('sending message:', msg)

    this.#socket.send(msg, (err) => {
      if (err) {
        delete this.#waitForResp[oid]
        this.#waitForResp[oid].reject(err)
      }
    })

    return this.#waitForResp[oid].promise
  }
}

export default WebsocketClient;
