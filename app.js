/*
 * Tweetstreamer
 * http://socket.io/
 * https://stream.twitter.com/1/statuses/sample.json
 * Twitter -> message -> publish to sockets
 * 
 * Notice:
 * Using patched verstion of twitter-node (https://raw.github.com/masterkain/twitter-node/master/lib/twitter-node/index.js)
 * due to Streaming API turning SSL only on September 29th (https://dev.twitter.com/blog/streaming-api-turning-ssl-only-september-29th)
 */
var express = require('express'),
		app = module.exports = express.createServer(),
		jqtpl = require('jqtpl').express,
		tweetstreamer = require('./lib/tweetstreamer'),
		config = tweetstreamer.read_config('public/config.'+app.settings.env+'.json'),
		streamer = Object.spawn(tweetstreamer.socket,{});

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'html');
	app.register( '.html', jqtpl );
	app.use(express.bodyParser());
	app.use(express.cookieParser());
  app.use(express.methodOverride());
  app.use(app.router);
	app.use(express.favicon());
	app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

/*
 * NODE_ENV=production node server.js
 */
app.configure('production', function(){
  app.use(express.errorHandler()); 
});

if (!module.parent){
	app.listen(config.socket.port);
//	app.listen(3000);
	console.log("Tweetstreamer app listening on port %d in %s mode", app.address().port, app.settings.env);
}

var io = require('socket.io').listen(app);
streamer.init(io,config);

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Twitter Feed Real-Time Parser'
  });
});