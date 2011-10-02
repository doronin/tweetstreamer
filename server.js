/*
 * Tweetstreamer cluster and cli
 * http://learnboost.github.com/cluster/
 * https://github.com/LearnBoost/cluster
 * nohup node server.js &
 */

var cluster = require('cluster'),
		port = 3000,
		cli = require('cluster').cli;

/*
 * Track twitter streams via console or open browser http://localhost:3000
 * 
 * Example:
 * node server.js console
 * tweetstreamer> user
 * tweetstreamer> pass
 * tweetstreamer> stop
 * tweetstreamer> track apple, ios
 * tweetstreamer> stop
 * tweetstreamer> help
 * tweetstreamer> exit
 */
cli.define('console', function(master){
	var tweetstreamer = require('./lib/tweetstreamer'),
			streamer = Object.spawn(tweetstreamer.cli,{});
	streamer.init(port);
}, 'Sign in to twitter');

cluster('app')
	.set('workers', 1)
	.set('socket path','./sockets')
	.set('title','tweetstreamer master')
	.set('worker title','tweetstreamer worker {n}')
//	.use(cluster.debug())
	.use(cluster.logger('logs'))
	.use(cluster.stats({ connections: true, lightRequests: true }))
	.use(cluster.repl(3008))
	.use(cluster.pidfiles())
	.use(cluster.cli())
	.use(cluster.reload(['lib','app.js','server.js'], { sig: 'SIGQUIT', interval: 5000 }))	// sig: 'SIGQUIT' - Graceful shutdown
	.listen(port);
//console.log("Tweetstreamer cluster listening on port %d", port);