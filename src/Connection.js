import {EventEmitter} from 'node:events';
import WebSocket from 'ws';

/**
 * The heart of the library: a thin client over the Chrome DevTools Protocol.
 *
 * It sends JSON commands to Chrome, matches each reply back to the command that
 * asked for it (using an auto-incrementing id), and routes browser/page events
 * to listeners. Per-page traffic is tagged with a `sessionId`.
 */
export class Connection extends EventEmitter {
  #ws;
  #lastId = 0;
  #callbacks = new Map();
  #sessions = new Map();

  constructor(ws) {
    super();
    this.#ws = ws;
    this.#ws.on('message', data => {
      this.#onMessage(data.toString());
    });
    this.#ws.on('close', () => {
      for (const {reject} of this.#callbacks.values()) {
        reject(new Error('Connection closed'));
      }
      this.#callbacks.clear();
      this.emit('disconnected');
    });
  }

  static async create(browserWSEndpoint) {
    const ws = new WebSocket(browserWSEndpoint, {
      maxPayload: 256 * 1024 * 1024,
    });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return new Connection(ws);
  }

  /** Send a CDP command and resolve with its result. */
  send(method, params = {}, sessionId) {
    const id = ++this.#lastId;
    const message = JSON.stringify({id, method, params, sessionId});
    return new Promise((resolve, reject) => {
      this.#callbacks.set(id, {resolve, reject, method});
      this.#ws.send(message, err => {
        if (err) {
          this.#callbacks.delete(id);
          reject(err);
        }
      });
    });
  }

  /** Get (or lazily create) a session-scoped sender for a given page. */
  session(sessionId) {
    let session = this.#sessions.get(sessionId);
    if (!session) {
      session = new CDPSession(this, sessionId);
      this.#sessions.set(sessionId, session);
    }
    return session;
  }

  close() {
    this.#ws.close();
  }

  #onMessage(raw) {
    const object = JSON.parse(raw);

    // A reply to a command we sent.
    if (object.id) {
      const callback = this.#callbacks.get(object.id);
      if (!callback) {
        return;
      }
      this.#callbacks.delete(object.id);
      if (object.error) {
        callback.reject(
          new Error(
            `Protocol error (${callback.method}): ${object.error.message}` +
              (object.error.data ? ` ${object.error.data}` : ''),
          ),
        );
      } else {
        callback.resolve(object.result);
      }
      return;
    }

    // An unsolicited event. Route page events to their session.
    if (object.sessionId) {
      const session = this.#sessions.get(object.sessionId);
      if (session) {
        session.emit(object.method, object.params);
      }
    } else {
      this.emit(object.method, object.params);
    }
  }
}

/** A command sender bound to one page/target's sessionId. */
export class CDPSession extends EventEmitter {
  #connection;
  #sessionId;

  constructor(connection, sessionId) {
    super();
    this.#connection = connection;
    this.#sessionId = sessionId;
  }

  send(method, params = {}) {
    return this.#connection.send(method, params, this.#sessionId);
  }

  get id() {
    return this.#sessionId;
  }
}
