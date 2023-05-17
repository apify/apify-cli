const Mixpanel = require('mixpanel');
const { MIXPANEL_TOKEN } = require('./consts');

exports.mixpanel = Mixpanel.init(MIXPANEL_TOKEN, { keepAlive: false });
