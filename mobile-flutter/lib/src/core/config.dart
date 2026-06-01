const apiHost = String.fromEnvironment('API_HOST', defaultValue: 'localhost');
const apiPort = String.fromEnvironment('API_PORT', defaultValue: '8080');
const apiBaseUrl = 'http://$apiHost:$apiPort';
const wsBaseUrl = 'ws://$apiHost:$apiPort/ws';

const stockBotId = 'stock_bot';
const stockBotName = '股票機器人';
const profileStorageKey = 'yuna-im-mobile-profile';
const maxCachedMessagesPerConversation = 200;
