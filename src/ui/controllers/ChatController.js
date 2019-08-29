import ChatService from '../../services/people/chat.js';
import ContactsService from '../../services/people/contacts';

import AllChatsController from './AllChatsController.js';

class ChatController {

  constructor(control) {
    this.control = control;
    this.peer = this.control.getActivePeer();
    this.contactsService = this.peer.getService(ContactsService.SERVICE_NAME);
    this.chatService = this.peer.getService(ChatService.SERVICE_NAME);

    this.knownChats = new Set();

    this.counterparts  = {};
    this.conversations = {};

    this.initialized = false;

    this.stateCallbacks = new Set();

    this.chatService.addNewMessageCallback((chat) => {
      this.processChat(chat);
      this.stateCallbacks.forEach(callback => callback());
    });

    let updateContacts = () => {
      this.contactsService.getContacts().forEach( profile => {
        this._checkCounterpart(profile.getIdentity());
      })
    };

    this.contactsService.addContactsChangeCallback(updateContacts);

    updateContacts();
  }

  init(callback) {
    this.chatService.getChats().then(chats => {
      console.log(chats);
      chats.forEach(chat => this.processChat(chat));
      this.initialized = true;
      if (callback !== undefined) {
        callback();
      }
    })
  }

  addStateCallback(callback) {
    this.stateCallbacks.add(callback);
  }

  processChat(chat) {

    if (this.knownChats.has(chat.fingerprint())) {
      return;
    }

    this.knownChats.add(chat.fingerprint());

    let identity = this.chatService.getIdentity();
    var counterpart = null;
    var userIsSender = null;

    if (chat.sender.equals(identity)) {
      userIsSender = true;
      counterpart = chat.recipient;
    } else if (chat.recipient.equals(identity)) {
      userIsSender = false;
      counterpart = chat.sender;
    }

    this._checkCounterpart(counterpart);

    let conversation = this.conversations[counterpart.fingerprint()];

    conversation['messages'].push(
      {
        id: chat.fingerprint(),
        counterpartName: counterpart.getParam('name'),
        userIsSender: userIsSender,
        content: chat.content,
        time: '',
        isSent: true,
        isReceived: true,
        isRead: false
      });

  }

  _checkCounterpart(counterpart) {
    if (!(counterpart.fingerprint() in this.counterparts)) {
      this.counterparts[counterpart.fingerprint()] = counterpart.getParam('name');
      this.conversations[counterpart.fingerprint()] =
        {
          type: 'user-chat',
          counterpartId: counterpart.fingerprint(),
          counterpartName: counterpart.getParam('name'),
          counterpartNameUrl: AllChatsController.nameToUrl(counterpart.getParam('name')),
          counterpartImage: null,
          messages: []
        };
    }
  }

  getChats() {
    console.log(this.conversations);
    return this.conversations;
  }

  getChatSummary() {
    let summary = Object.keys(this.conversations).map(
      counterpartId => {
        let conversation = this.conversations[counterpartId];
        var lastMessage = null;
        let messages = conversation['messages'];
        if (messages.length > 0) {
          lastMessage = messages[messages.length-1];
        }
        return {
          type: conversation['type'],
          counterpartId: conversation['counterpartId'],
          counterpartName: conversation['counterpartName'],
          counterpartNameUrl: conversation['counterpartNameUrl'],
          counterpartImage: conversation['counterpartImage'],
          lastMessageUserIsSender: lastMessage !== null && lastMessage['userIsSender'],
          lastMessageStatus: lastMessage === null? null :
                              (lastMessage['isRead']? 'read' :
                                (lastMessage['isReceived']? 'received' :
                                  (lastMessage['isSent']? 'sent' : null))),
          lastMessageContent: lastMessage === null? '' : lastMessage['content'],
          lastMessageTime: lastMessage === null? '' : lastMessage['time'],
        }
      });

    return summary;
  }

  sendChat(recipientFingerprint, content) {
    return this.chatService.sendChatMessage(recipientFingerprint, content);
  }


}


export default ChatController;