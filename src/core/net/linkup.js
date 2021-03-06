import Logger from '../util/logging.js';

/* Link up implementations to be used for connection
   init and WebRTC signalling.
   The system uses two independent objects, a listener
   that is intended to receive all signalling messages
   for a given user, and a caller that is used to
   send signalling messages to a given user.
   A callId is used to multiplex the listening channel. */

/* LocalLinkup: a local listener that
   works in the browser using a BroadcastChannel
   JavaScript object, for testing mainly. */

class Endpoint {

  static fromFullURL(url) {

    if (url[url.length-1] === '/') {
      url = url.substring(0, url.length-1);
    }

    var urlParts = url.split('/');
    var linkupId = urlParts.pop();
    urlParts.push('');
    var serverUrl = urlParts.join('/');

    return new Endpoint(serverUrl, linkupId);
  }

  constructor(serverURL, linkupId) {
   this.serverURL = serverURL;
   this.linkupId  = linkupId;
  }

  url() {
    var sep = '/';
    if (this.serverURL[this.serverURL.length-1] === '/') {
      sep = '';
    }

    return this.serverURL + sep + this.linkupId;
  }
}

// the manager keeps the websocket connections to the linkup iceServers

class LinkupManager {
  constructor() {
    this.connections = new Map();
  }

  // for now, you can't listen for serveral linkupIds on the same serverURL
  getListener(endpoint) {
    var connection = this._getConnection(endpoint.serverURL);
    return connection.getListener(endpoint.linkupId);
  }

  getCaller(remoteEndpoint, localEndpoint) {
    var connection = this._getConnection(remoteEndpoint.serverURL);
    return connection.getCaller(remoteEndpoint.linkupId, localEndpoint);
  }

  _getConnection(serverURL) {
    var connection = this.connections.get(serverURL);
    if (connection == null) {
      connection = new WebsocketLinkupConnection(serverURL);
      this.connections.set(serverURL, connection);
    }
    return connection;
  }
}

class WebsocketLinkupConnection {
  constructor(serverURL) {
    this.logger = new Logger(this);
    this.logger.setLevel(Logger.INFO());

    this.serverURL = serverURL;
    this.ws = null;

    // For receiving messages:
    this.listeners = new Map();

    // For sending messages:
    this.messageQueue = [];

    // Start a connection assuming it will be needed soon.
    this._checkWebsocket();
  }

  getListener(linkupId) {
    var listener = this.listeners.get(linkupId);
    if (listener === undefined) {
      listener = new WebsocketLinkupListenerProxy(linkupId);
      this.listeners.set(linkupId, listener);
      this._setUpListener(linkupId);
      // If the websocket isn't ready yet, _setUpListener will be called again once it is.
    }
    this._checkWebsocket();
    return listener;
  }

  getCaller(linkupId, localEndpoint) {
    return new WebsocketLinkupCallerProxy(linkupId, this, localEndpoint);
  }

  send(linkupId, callId, messageData, replyServerUrl, replyLinkupId) {
    var message = {
                'action':   'send',
                'linkupId': linkupId,
                'callId':   callId,
                'data':     messageData,
                'replyServerUrl': replyServerUrl,
                'replyLinkupId':  replyLinkupId,
              };
    this._enqueueAndSend(JSON.stringify(message));
  }

  _setUpListeners() {
    for (const linkupId of this.listeners.keys()) {
      this._setUpListener(linkupId);
    }
  }

  // Notice this function is idempotent.
  _setUpListener(linkupId) {

    // check if we need to send a LISTEN message.
    if (this.ws !== null && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify({'action': 'listen', 'linkupId': linkupId}));
      this.logger.debug('sending listen command through websocket for linkupId ' + linkupId);
    }
  }

  _checkWebsocket() {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      return true;
    } else {
      if (this.ws === null ||
          (this.ws.readyState === WebSocket.CLOSING ||
           this.ws.readyState === WebSocket.CLOSED)) {
        this.logger.debug('creating websocket to server ' + this.serverURL);
        this.ws = new WebSocket(this.serverURL);

        this.ws.onmessage = (ev) => {
          var message = JSON.parse(ev.data);

          if (message['action'] === 'ping') {
            this.logger.trace('sending pong to ' + this.serverURL);
            this.ws.send(JSON.stringify({'action' : 'pong'}));
          } else if (message['action'] === 'send') {
            const linkupId = message['linkupId'];
            const listener = this.listeners.get(linkupId);
            if (listener !== undefined) {
              this.logger.trace('delegating send action on ' + linkupId + ' to listener');
              listener._onMessage(message);
            } else {
              this.logger.trace('received message for unlistened linkupId: ' + linkupId + ', discarding');
            }
          } else {
            this.logger.info('received unknown message on ' + this.linkupId + ': ' + ev.data);
          }
        }

        this.ws.onopen = (ev) => {
          this.logger.debug('done creating websocket to URL ' + this.serverURL);
          this._setUpListeners();
          this._emptyMessageQueue();
        }
      }
      return false;
    }
  }

  _enqueueAndSend(message) {
    this.messageQueue.push(message);
    this._emptyMessageQueue();
  }

  _emptyMessageQueue() {
    if (this._checkWebsocket()) {
      this.logger.debug('about to empty message queue to ' +
                        this.serverURL + ' (' + this.messageQueue.length +
                        ' messages to send)');
      while (this.messageQueue.length > 0) {
        var message = this.messageQueue.shift();
        this.logger.trace('about to send this to ' + this.serverURL);
        this.logger.trace(message);
        this.ws.send(message);
      }
    }
  }
}

class WebsocketLinkupCallerProxy {
  constructor(linkupId, connection, localEndpoint) {
    this.linkupId   = linkupId;
    this.connection = connection;
    this.localEndpoint = localEndpoint;
  }

  send(callId, messageData) {
    this.connection.send(this.linkupId, callId, messageData,
                         this.localEndpoint.serverURL, this.localEndpoint.linkupId);
  }

}

class WebsocketLinkupListenerProxy {
  constructor(linkupId) {
    this.logger = new Logger(this);
    this.logger.setLevel(Logger.INFO());

    this.linkupId = linkupId;

    this.callbacks = new Map();
    this.defaultCallback = null;
  }

  _onMessage(message) {

    var done = false;

    if (message['action'] === 'send') {
      this.logger.trace('received send action on ' + this.linkupId);
      this.logger.trace(this.callbacks.has(message['callId']));
      if (this.callbacks.has(message['callId'])) {
        var channelCallbacks = this.callbacks.get(message['callId']);
        channelCallbacks.forEach((callback, index, array) => {
          callback(message['data']);
          done = true;
          this.logger.debug('delivering to ' + this.linkupId + ' on ' + message['callId']);
        });
      }
      if (!done && this.defaultCallback != null) {
        this.logger.debug('firing ' + this.linkupId + 's default callback on ' + message['callId']);
        this.defaultCallback(message['callId'], message['data'], message['replyServerUrl'], message['replyLinkupId']);
      }
    }
  }

  setDefaultCallback(callback) {
    this.defaultCallback = callback;
  }

  registerCallback(callId, callback) {
    if (! this.callbacks.has(callId)) {
      this.callbacks.set(callId, []);
    }

    this.callbacks.get(callId).push(callback);
  }
}


/// These versions are outdated:

class LocalLinkupListener {

  constructor(endpoint) {
    this.logger = new Logger(this);
    this.logger.setLevel(Logger.DEBUG());

    this.endpoint = endpoint;
    this.callbacks = new Map();
    this.defaultCallback = null;
    this.broadcast = null; //FIXME
       //new BroadcastChannel('mypeer.net link up channel');

    this.broadcast.onmessage = ((ev) => {
      var message = ev.data;

      if (! (message['endpoint'] === this.endpoint)) {
        var done = false;
        if (this.callbacks.has(message['callId'])) {
          var channelCallbacks = this.callbacks.get(message['callId']);
          channelCallbacks.forEach((item, index, array) => {
            item(message['data']);
            done = true;
            this.logger.debug('delivering to ' + this.endpoint + ' from ' + message['endpoint'] + ' on ' + message['callId']);
          });
        }
        if (!done && this.defaultCallback != null) {
          this.logger.debug('firing ' + this.endpoint + 's default callback on ' + message['callId'] + ' (from ' + message['endpoint'] + ')');
          this.defaultCallback(message['callId'], message['data']);
        }
      }
    });

  }

  setDefaultCallback(callback) {
    this.defaultCallback = callback;
  }

  registerCallback(callId, callback) {
    if (! this.callbacks.has(callId)) {
      this.callbacks.set(callId, []);
    }

    this.callbacks.get(callId).push(callback);
  }

}

class LocalLinkupCaller {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.broadcast = null; //FIXME
       //new BroadcastChannel('mypeer.net link up channel');
  }

  send(callId, message) {
    this.broadcast.postMessage({'endpoint': this.endpoint,
                                'callId': callId,
                                'data': message});
  }
}



class RoutedLinkupListener {

}

class RouterLinkupCaller {

}

export { LinkupManager, Endpoint, WebsocketLinkupConnection };
