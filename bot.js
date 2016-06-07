var Botkit = require('botkit');
var Twit = require('twit');
var sentiment = require('sentiment');
var Quiche = require('quiche');
var findHashtags = require('find-hashtags');
var config = require('./config');
var config2 = require('./config2');
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
    interval: 0,
    positive: 0,
    negative: 0,
    neutral: 0
};
var topHashtags = {};
var topUsersObj = {};
var sentimentIntervalArr = [];
var xAxisLabelArr = [];
var chartColors = {
    pos: '04B8F2',
    neg: 'EDED1D',
    neu: 'C1D1CC'
};


function resetVars() {
    sentimentObj = {};
    sentimentIntervalObj = {
        interval: 0,
        positive: 0,
        negative: 0,
        neutral: 0
    };
    topHashtags = {};
    topUsersObj = {};
    sentimentIntervalArr = [];
}

//constructs Sentiment Distribution by Time Interval bar chart
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



    var bar = new Quiche('bar');
    bar.setWidth(400);
    bar.setHeight(265);
    bar.setTitle('Sentiment Distribution by Time Interval');
    bar.setBarStacked(); // Stacked chart
    bar.setBarWidth(0);
    bar.setBarSpacing(6); // 6 pixles between bars/groups
    bar.setLegendBottom('Intervals'); // Put legend at bottom
    bar.setTransparentBackground(); // Make background transparent

    bar.addData(neuArr, 'Neutral', chartColors.neu);
    bar.addData(negArr, 'Negative', chartColors.neg);
    bar.addData(posArr, 'Positive', chartColors.pos);


    bar.setAutoScaling(); // Auto scale y axis
    bar.addAxisLabels('x', xAxisLabelArr);

    var imageUrl = bar.getUrl(true); // First param controls http vs. https

    bot.reply(message, {
        attachments: [{
            fallback: 'Sentiment Distribution by Time Interval',
            image_url: imageUrl,
            color: "#4099FF"
        }]
    });

}

function makePie(bot, message) {
    var pie = new Quiche('pie');

    pie.set3D();
    pie.setTitle('Sentiment Distribution');
    pie.setTransparentBackground(); // Make background transparent
    pie.addData(sentimentObj.positive || 0, 'Positive '.concat(sentimentObj.positive || 0), chartColors.pos);
    pie.addData(sentimentObj.negative || 0, 'Negative '.concat(sentimentObj.negative || 0), chartColors.neg);
    pie.addData(sentimentObj.neutral || 0, 'Neutral '.concat(sentimentObj.neutral || 0), chartColors.neu);


    var imageUrl = pie.getUrl(true); // First param controls http vs. https 

    bot.reply(message, {
        attachments: [{
            fallback: 'Sentiment Distribution',
            image_url: imageUrl,
            color: "#4099FF"
        }]
    });

}

//bot outputs top 5 hashtags
function getTop5Hashtags(bot, message) {
    var arr = Object.keys(topHashtags).map(function(hashtag) {
        return {
            hashtag: hashtag,
            count: topHashtags[hashtag]
        };
    }).sort(function(a, b) {
        return b.count - a.count;
    });

    var len = arr.length >= 5 ? 5 : arr.length;
    var top5HashText = '';
    for (var i = 0; i < len; i++) {
        top5HashText = top5HashText + arr[i].count + ' for #' + arr[i].hashtag + '\n';
    }

    bot.reply(message, {
        attachments: [{
            fallback: 'Top 5 Hashtags!',
            title: 'Top 5 Hashtags',
            text: top5HashText,
            color: "#4099FF",
        }]
    });

}

//bot outputs top 5 posters
function getTop5Posters(bot, message) {
    var arr = Object.keys(topUsersObj).map(function(username) {
        return {
            user: username,
            tweets: topUsersObj[username]
        };
    }).sort(function(a, b) {
        return b.tweets - a.tweets;
    });


    var top5posterText = "";
    var len = arr.length >= 5 ? 5 : arr.length;
    for (var i = 0; i < len; i++) {
        top5posterText = top5posterText + arr[i].tweets + ' from @' + arr[i].user + ' https://www.twitter.com/' + arr[i].user.toLowerCase() + '\n';
    }

    bot.reply(message, {
        attachments: [{
            fallback: 'Top 5 Posters!',
            text: top5posterText,
            title: 'Top 5 Posters',
            color: "#4099FF",
        }]
    });
}

function startStream(bot, message) {
    stream.on('tweet', function(tweet) {

        if (!tweet.retweeted && !tweet.text.startsWith('RT')) {
            var sent;
            var score = sentiment(tweet.text).score;

            if (score < 0) {
                sent = 'negative';

                if (negativeAlerts) {
                    bot.reply(message, {
                        attachments: [{
                            fallback: 'Negative Post Alert!',
                            text: tweet.created_at + ', posted by ' + tweet.user.screen_name + ': ' + tweet.text,
                            title: 'NEGATIVE POST ALERT!',
                            color: "#FF0000"
                        }]
                    });

                }
            }
            else if (score > 0) {
                sent = 'positive';
            }
            else if (score === 0) {
                sent = 'neutral';
            }

            //inserts into an object and/or increments positive, negative or neutral
            if (!sentimentObj[sent]) {
                sentimentObj[sent] = 1;
            }
            else {
                sentimentObj[sent] = sentimentObj[sent] + 1;
            }
            sentimentIntervalObj[sent]++;


            //top users
            if (!topUsersObj[tweet.user.screen_name]) {
                topUsersObj[tweet.user.screen_name] = 1;
            }
            else {
                topUsersObj[tweet.user.screen_name] = topUsersObj[tweet.user.screen_name] + 1;
            }

            //top hastags
            var hashtags = findHashtags(tweet.text);
            if (hashtags) {
                hashtags.forEach(function(element) {
                    if (!topHashtags[element]) {
                        topHashtags[element] = 1;
                    }
                    else {
                        topHashtags[element] = topHashtags[element] + 1;
                    }
                });
            }

        }

    });

    timer = setInterval(function() {
        sentimentIntervalObj.interval++;
        xAxisLabelArr.push(sentimentIntervalObj.interval);
        bot.reply(message, {
            attachments: [{
                fallback: 'Interval heading!',
                text: 'Interval Report ' + sentimentIntervalObj.interval + ': ' + sentimentIntervalObj.interval + 'm',
                color: "#FFFF00",
            }]
        });
        
        makePie(bot, message);
        getTop5Posters(bot, message);
        getTop5Hashtags(bot, message);
        sentimentIntervalArr.push(sentimentIntervalObj);
        if (sentimentIntervalObj.interval > 1) {
            makeBar(bot, message);
        }
        
        if (sentimentIntervalArr.length === 10) {
            sentimentIntervalArr.reverse();
            sentimentIntervalArr.pop();
            sentimentIntervalArr.reverse();

            xAxisLabelArr.reverse();
            xAxisLabelArr.pop();
            xAxisLabelArr.reverse();
        }

        sentimentIntervalObj = {
            interval: sentimentIntervalObj.interval,
            positive: 0,
            negative: 0,
            neutral: 0
        };
    }, 60000);
}

controller.hears(['follow tweets (.*)', 'follow on (.*)'], 'direct_message', function(bot, message) {
    if (!stream) {
        //bot.reply(message, 'LAHOWENJO839U9:  ' + message.match[1] + ', length: ' + message.match[1].length);
        stream = T.stream('statuses/filter', {
            track: [message.match[1]]
        });

        resetVars();
        startStream(bot, message);
        bot.reply(message, 'Okay. I will be tracking *' + message.match[1] + '* on Twitter, and provide you a summary report at one minute intervals.');
    }
    else {
        bot.reply(message, 'Already tracking twitter!');
    }


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
        bot.reply(message, 'Negative twitter post alert has been turned ON at your request.');
    }

});

controller.hears('negative alerts off', 'direct_message', function(bot, message) {
    if (!negativeAlerts) {
        bot.reply(message, 'Alerts for negative twitter posts is not on.');
    }
    else {
        negativeAlerts = false;
        bot.reply(message, 'Negative twitter post alert has been turned OFF at your request.');
    }

});

controller.hears('test', 'direct_message', function(bot, message) {

    bot.reply(message, {
        attachments: [{
            fallback: 'Negative Post Alert!',
            text: 'Negative Post Alert!',
            color: "#FF0000"
        }]
    });

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