const apiHost = String.fromEnvironment('API_HOST', defaultValue: 'localhost');
const apiPort = String.fromEnvironment('API_PORT', defaultValue: '8080');
const apiBaseUrl = 'http://$apiHost:$apiPort';
const wsBaseUrl = 'ws://$apiHost:$apiPort/ws';

const profileStorageKey = 'yuna-im-mobile-profile';
const maxCachedMessagesPerConversation = 200;
