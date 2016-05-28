var Botkit = require('botkit');
var Twit = require('twit');
var config = require('./config');
var config2 = require('./config2');
var os = require('os');

var T = new Twit(config);

var controller = Botkit.slackbot({
    debug: false,
});

var bot = controller.spawn(config2).startRTM();


function cancellable(callback) {

    var stopPattern = {
        pattern: '^(cancel|stop)$',
        callback: function(message, convo) {
            convo.stop();
        }
    };

    if (Array.isArray(callback)) {
        return callback.concat(stopPattern)
    }

    return [{
            default: true,
            callback: callback
        },
        stopPattern
    ];
}



controller.hears('twitter', 'direct_message', function(bot, message) {
    
    var stream = T.stream('statuses/filter', {
        track: ['montreal']
    });
    bot.reply(message, 'OK. Live stream for "montreal" twitter posts on console!');
    stream.on('tweet', function(tweet) {
        if (tweet.user.lang === 'en') {
            console.log(tweet.created_at + ', posted by ' + tweet.user.screen_name + ': ' + tweet.text);
        }
    });
});



controller.hears('.*', 'direct_message', function(bot, message) {
    bot.reply(message, `Sorry sir, I don't understand.  I specialize only in things Twitter.`);
})