var Botkit = require('botkit');
var Twit = require('twit');
var twitterAPI = require('node-twitter-api');
var sentiment = require('sentiment');
var Quiche = require('quiche');
var TinyURL = require('tinyurl');
var config = require('./config');
var config2 = require('./config2');
var config3 = require('./config3');
var config4 = require('./config4');
var os = require('os');
var AYLIENTextAPI = require('aylien_textapi');
var textapi = new AYLIENTextAPI(config3);

var twitter = new twitterAPI(config4);
var T = new Twit(config);

var negativeAlerts = false;
var stream;
var timer;

var controller = Botkit.slackbot({
    debug: false,
});

var bot = controller.spawn(config2).startRTM();
var sentimentObj = {};
var sentimentIntervalObj = {
    positive: 0,
    negative: 0,
    neutral: 0
};
var topUsersObj = {};
var sentimentIntervalArr = [];


function makeBar(bot, message) {
    var Quiche = require('quiche');
    //var lastInterval = sentimentIntervalArr.length;
    //var bottom = lastInterval < 10 ? 0 : lastInterval;
    var negArr = sentimentIntervalArr.map(function(obj) {
        return obj.negative;
    });
    var posArr = sentimentIntervalArr.map(function(obj) {
        return obj.positive;
    });
    var neuArr = sentimentIntervalArr.map(function(obj) {
        return obj.neutral;
    });

    // console.log('neg: '+negArr);
    // console.log('pos: '+posArr);
    // console.log('neu: '+neuArr);

    var bar = new Quiche('bar');
    bar.setWidth(400);
    bar.setHeight(265);
    bar.setTitle('Sentiment distribution by Interval');
    bar.setBarStacked(); // Stacked chart
    bar.setBarWidth(0);
    bar.setBarSpacing(6); // 6 pixles between bars/groups
    bar.setLegendBottom('Intervals'); // Put legend at bottom
    bar.setTransparentBackground(); // Make background transparent

    bar.addData(neuArr, 'Neutral', 'FF0000');
    bar.addData(negArr, 'Negative', '0000FF');
    bar.addData(posArr, 'Positive', '008000');


    bar.setAutoScaling(); // Auto scale y axis
    bar.addAxisLabels('x', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

    var imageUrl = bar.getUrl(true); // First param controls http vs. https
    TinyURL.shorten(imageUrl, function(res) {
        bot.reply(message, res);
        console.log(res); //Returns a shorter version of http://google.com - http://tinyurl.com/2tx 
    });
}

function makePie(bot, message) {
    var pie = new Quiche('pie');

    pie.set3D();
    pie.setTitle('Sentiment distribution');
    pie.setTransparentBackground(); // Make background transparent
    pie.addData(sentimentObj.positive || 0, 'Positive '.concat(sentimentObj.positive || 0), 'FF0000');
    pie.addData(sentimentObj.negative || 0, 'Negative '.concat(sentimentObj.negative || 0), '0000FF');
    pie.addData(sentimentObj.neutral || 0, 'Neutral '.concat(sentimentObj.neutral || 0), '00FF00');


    var imageUrl = pie.getUrl(true); // First param controls http vs. https 
    TinyURL.shorten(imageUrl, function(res) {
        bot.reply(message, res);
        console.log(res); //Returns a shorter version of http://google.com - http://tinyurl.com/2tx 
    });
    // console.log(sentimentObj);
}

function getTop5Posters(bot, message) {
    var arr = Object.keys(topUsersObj).map(function(username) {
        return {
            user: username,
            tweets: topUsersObj[username]
        };
    }).sort(function(a, b) {
        return b.tweets - a.tweets;
    });

    bot.reply(message, 'top 5 posters');
    var len = arr.length >= 5 ? 5 : arr.length;
    for (var i = 0; i < len; i++) {
        bot.reply(message, arr[i].tweets + ' posts from @' + arr[i].user);
    }
}




function sentimentTweet(tweet, callback) {
    textapi.sentiment({
        text: tweet,
        mode: 'tweet'
    }, function(error, response) {
        if (error === null) {
            callback(response);
        }
    });
}

function cancellable(callback) {

    var stopPattern = {
        pattern: '^(cancel|stop)$',
        callback: function(message, convo) {
            convo.stop();
        }
    };

    if (Array.isArray(callback)) {
        return callback.concat(stopPattern);
    }

    return [{
            default: true,
            callback: callback
        },
        stopPattern
    ];
}



controller.hears('twitter', 'direct_message', function(bot, message) {

    stream = T.stream('statuses/filter', {
        track: ['kardashian']
    });
    bot.reply(message, 'OK. Live stream for "montreal" or habs twitter posts on console!');
    stream.on('tweet', function(tweet) {
        if (!tweet.retweeted) {
            //code for sentiment anaysis
            var sent;
            var score = sentiment(tweet.text).score;

            if (score < 0) {
                sent = 'negative';
                if (negativeAlerts) {
                    bot.reply(message, tweet.created_at + ', posted by ' + tweet.user.screen_name + ': ' + tweet.text);
                }
            }
            else if (score > 0) {
                sent = 'positive';
            }
            else if (score === 0) {
                sent = 'neutral';
            }
            console.log(score, ' | ', sent);
            //inserts into an object and/or increments positive, negative or neutral
            if (!sentimentObj[sent]) {
                sentimentObj[sent] = 1;
            }
            else {
                sentimentObj[sent] = sentimentObj[sent] + 1;


            }
            sentimentIntervalObj[sent]++;
            console.log(sentimentIntervalObj);
            //top users
            if (!topUsersObj[tweet.user.screen_name]) {
                topUsersObj[tweet.user.screen_name] = 1;
            }
            else {
                topUsersObj[tweet.user.screen_name] = topUsersObj[tweet.user.screen_name] + 1;
            }

        }

    });

    timer = setInterval(function() {
        //console.log('timer');
        makePie(bot, message);
        getTop5Posters(bot, message);
        
        sentimentIntervalArr.push(sentimentIntervalObj);
        makeBar(bot, message);
        // console.log(sentimentIntervalArr);
        // console.log('negative first entry: '+sentimentIntervalArr[0].negative);
        sentimentIntervalObj = {
            positive: 0,
            negative: 0,
            neutral: 0
        };
    }, 60000);

});

controller.hears('stop', 'direct_message', function(bot, message) {
    if (stream) {
        stream.stop();
        stream = null;
        bot.reply(message, 'stream ended.');
        clearInterval(timer);
    }
    else {
        bot.reply(message, 'there is no stream');
    }

});

controller.hears('negative alerts on', 'direct_message', function(bot, message) {
    if (negativeAlerts) {
        bot.reply(message, 'Alerts for negative twitter posts already on.');
    }
    else {
        negativeAlerts = true;
        bot.reply(message, 'Negative twitter post alert has been turned OFF at your request.')
    }

});

controller.hears('negative alerts off', 'direct_message', function(bot, message) {
    if (!negativeAlerts) {
        bot.reply(message, 'Alerts for negative twitter posts is not on.');
    }
    else {
        negativeAlerts = false;
        bot.reply(message, 'Negative twitter post alert has been turned ON at your request.')
    }

});

controller.hears('bar', 'direct_message', function(bot, message) {

    makeBar(bot, message);
});

controller.hears('pie', 'direct_message', function(bot, message) {

    makePie(bot, message);
});

controller.hears('top', 'direct_message', function(bot, message) {

    getTop5Posters(bot, message);
});


controller.hears('.*', 'direct_message', function(bot, message) {
    bot.reply(message, `Sorry sir, I don't understand.  I specialize only in things Twitter.`);
})