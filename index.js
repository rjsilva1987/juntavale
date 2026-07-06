require('react-native-url-polyfill/auto');
require('./src/polyfills/domRect');

const { registerRootComponent } = require('expo');
const App = require('./App').default;

registerRootComponent(App);