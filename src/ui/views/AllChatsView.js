import React from 'react';

import Grid from '@material-ui/core/Grid';

import AllChats from '../components/AllChats.js';

import { InviteInfo } from '../../services/people/contacts.js';


class AllChatsView extends React.Component {
  constructor(props) {
    super(props);
    // props.match.params.*

    this.controller = props.controller;
    this.contactsController = props.controller.getContactsController();
    this.chatController    = this.controller.getChatController();


    this.contactsController.addStateCallback(() => {
      this.setState({pendingInvites: this.contactsController.getPendingInvites(),
                     contacts: this.contactsController.getContacts()});
    });


    this.chatController.addStateCallback(() => {
      this.setState({chatsSummary: this.chatController.getChatSummary()});
    });

    var receivedInviteInfo = null;
    if (this.props.match.params.token !== undefined) {
      receivedInviteInfo = InviteInfo.decode(this.props.match.params.token);
    }

    this.state = {  chatsSummary: null,
                    loadingChatsSummary: true,
                    newChat: props.match.url.startsWith('/new-chat'),
                    addContacts: props.match.url.startsWith('/add-contacts'),
                    showReceiveInvite: props.match.url.startsWith('/contact-link'),
                    pendingInvites: this.contactsController.getPendingInvites(),
                    contacts: this.contactsController.getContacts(),
                    receivedInviteInfo: receivedInviteInfo
                 };


     this.chatController.init(() => {
       this.setState({chatsSummary: this.chatController.getChatSummary(),
                      loadingChatsSummary: false
                    });
                  });
    /*this.contactsController = props.controller;

    this.contactsController.queryView({view: this.allCatsController.VIEW_CHATS_SUMMARY(), callback: this.receiveChatsSummary});*/
  }

  static getDerivedStateFromProps(props, state) {
    return {newChat: props.match.url.startsWith('/new-chat'),
            addContacts: props.match.url.startsWith('/add-contacts'),
            showReceiveInvite: props.match.url.startsWith('/contact-link')
           };
  }

  receiveChatsSummary = (params, chatsSummary) => {
    this.setState({chatsSummary: chatsSummary, loadingChatsSummary: false});
  }

  render() {
    return (
      <Grid container style={{height:"100%"}}>
        <Grid item xs={12} md={4} style={{overflow:'auto', height: '100%', position: 'relative'}}>
          <AllChats
            recipientId={null} 
            chatsSummary={this.state.chatsSummary}
            loadingChatsSummary={this.state.loadingChatsSummary}
            newChat={this.state.newChat}
            addContacts={this.state.addContacts}
            showReceiveInvite={this.state.showReceiveInvite}
            contacts={this.state.contacts}
            pendingInvites={this.state.pendingInvites}
            receivedInviteInfo={this.state.receivedInviteInfo}
            controller={this.controller}
          />
        </Grid>
        <Grid item xs={false} md={8}>

        </Grid>
      </Grid>
    );
  }


}

export default AllChatsView;
