import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './ui/App.js';
import * as serviceWorker from './serviceWorker';

import { PeerManager } from './core/peer/peering.js';



//import { testReplication } from './scratchpad.js';
//testReplication();

//import { testMessaging } from './scratchpad.js';
//testMessaging();

//import { testContacts } from './scratchpad.js';
//testContacts();


const peerManager = new PeerManager();

ReactDOM.render(<App peerManager={peerManager}/>, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
