/*
 * Tweetstreamer
 */

var util = require('util'),
		fs = require('fs'),
		crypto = require('crypto'),
		TwitterNode = require('twitter-node').TwitterNode;
//		EventEmitter = require("events").EventEmitter;

if (!('stop' in TwitterNode.prototype)){
	TwitterNode.prototype.stop = function stream() {
		if (this._clientResponse && this._clientResponse.connection) {
			this._clientResponse.socket.end();
		}
	}
}

if (!('spawn' in Object)){
	Object.spawn = function (parent, props) {
		var defs = {}, key;
		for (key in props) {
			if (props.hasOwnProperty(key)) {
				defs[key] = {value: props[key], enumerable: true};
			}
		}
		return Object.create(parent, defs);
	}
}

/*
 * Tweetstreamer base: collection of clients and feeds
 * clients
 *	uid
 *	stream
 *	track
 *	streams
 *	
 * Notes:
 *		Each account may create only one standing connection to the Streaming API.
 *		Subsequent connections from the same account may cause previously established connections to be disconnected
 */
var Tweetstreamer = {
	config: {},
	clients: [],
	add_client: function(uid,user,password,track){
		if (uid in this.clients){
			return	false;
		}
		var track = track || ['twitter'],	//	initial track
				tid = this.tid(track,uid);
		this.clients[uid] = { stream: {}, tid: tid, track: track, tracks: [] };//, signedin: false
		this.clients[uid].tracks[tid] = track;
		var stream = this.stream(user,password,track);
		this.clients[uid].stream = stream;
		return	this.clients[uid];
	},
	remove_client: function(uid){
		if (uid in this.clients){
			delete this.clients[uid];
		}
	},
	get_client: function(uid){
		if (uid in this.clients){
			return this.clients[uid];
		} else {
			return false;
		}
	},
	/*
	 * Create TwitterNode object
	 */
	stream: function(user,password,track){
		return new TwitterNode({
			user: user,
			password: password,
			track: track,
			headers: { 'User-Agent': 'node.tweetstreamer' },
			debug: true
		});
	},
	/*
	 * Add tracking query and start (re)stream with new trackKeywords
	 */
	track: function(track, uid){
		var tracklist = this.track_list(track),
				tid = this.tid(tracklist,uid),
				client = this.get_client(uid);
		if (!(tid in client.tracks)){
			client.tracks[tid] = track;	//	track new
		}
		client.track = tracklist;
		client.tid = tid;
		client.stream.trackKeywords = tracklist;
		client.stream.stream();
		return	tid;
	},
	/*
	 * Split csv and trim items
	 */
	track_list: function(track){
		var tracklist = track.split(',');
		tracklist.forEach(function(val,index,array){
			array[index] = val.trim();
		});
		return	tracklist;
	},
	get_track: function(tid, uid){
		var client = this.get_client(uid);
		if (tid in client.tracks){
			return client.tracks[tid];
		} else {
			return false;
		}
	},
	/*
	 * Track id
	 */
	tid: function(value,uid){
		var shasum = crypto.createHash('sha1');
		shasum.update(uid+value.join());
		return shasum.digest('hex');
	},
	error: function(error){
		console.log('Error: ',error);
	},
	info: function(){
		console.log('info:');
		console.log('clients:',this.clients);
		console.log('streams:',this.streams);
	}
}

/*
 * Browser tweetstreamer version
 * transport: websockets
 */
var SocketTweetstreamer = Object.spawn(Tweetstreamer,{
	init: function(io,config){
		var self = this;
		io.of('/'+config.socket.namespace).on('connection', function(socket){
			var uid = socket.id;
			socket.emit('ready', {});
			socket.on('signin', function(data){
				var client = self.add_client(uid,data.user,data.password);
				if (!client){
					socket.emit('client.exists');
					self.error('client exists');
					return false;
				}
				client.stream
					.addListener('tweet', function(tweet){
						socket.emit('tweet',{ user: tweet.user.screen_name, text: tweet.text });
					})
					.addListener('error', function(error){
						self.error(error.message);
					})
					.addListener('end', function(resp) {
						if (resp.statusCode==401){
							socket.emit('access.denied', { error: 'Bad username or password' });
							self.error('Unauthorised');
							self.remove_client(uid);
						} else {
							self.error('Code '+resp.statusCode);
						}
					})
					.addListener('ok', function(){
						socket.emit('access.granted');
						socket.emit('track', { tid: client.tid, track: client.track })
						client.stream.removeAllListeners('ok');
					})
					.stream();
			});
			socket.on('disconnect', function(){
				var uid = socket.id;
				self.remove_client(uid);
			});
			socket.on('signout', function(data){
				var uid = socket.id;
				self.remove_client(uid);
			});
			socket.on('stop', function(){
				var uid = socket.id,
						client = self.get_client(uid);
				client.stream.stop();
			});
			socket.on('track',function(data){
				var uid = socket.id,
						tid = self.track(data.track, uid),
						client = self.get_client(uid);
				if (tid == data.tid){
					console.log('old track')
				}
				client.stream.stream();
				socket.emit('track',{ tid: tid, track: data.track });
			})
		});
	}
});

/*
 * Command line tweetstreamer version
 * transport: console
 * 
 * Example usage: node server.js console
 *	tweetstreamer> -u username -p password "lewis,hamilton,formula one"
 */
var CliTweetstreamer = Object.spawn(Tweetstreamer,{
	rl: false,
	init: function(port){
		console.log("Tweetstreamer cluster listening on port %d", port);

		var self = this,
				readline = require('readline'),
				prefix = 'tweetstreamer> ';
		this.rl = readline.createInterface(process.stdin, process.stdout);

		this.rl.question("Please enter twitter login \n"+prefix,function(user){
			self.rl.question("Please enter twitter password \n"+prefix,function(password){
				var uid = self.uid({ user: user, password: password });
				if (!uid){
					this.error('User or password not set');
					return;
				}
				self.start({ uid: uid, user: user, password: password, value: ['twitter'] });

				console.log('');
				console.log(prefix + 'Hello. Type "help" to see command list');
				self.rl.on('line', function(line) {
					var cmdline = line.trim().split(' '),
							command = cmdline.shift(),
							args = cmdline.join(' ');
					switch(command) {
						case 'help':
							self.help();
							break;
						case 'track':
							console.log('Tracking: '+args);
							var tid = self.track(args, uid);
							break;
						case 'stop':
							var client = self.get_client(uid);
							client.stream.stop();
							break;
						case 'info':
							self.info();
							break;
						case 'exit':
							self.exit();
							break;
						default:
							self.error('No such command: '+command);
							console.log('Type "help" to see command list');
							break;
					}
					self.rl.setPrompt(prefix, prefix.length);
					self.rl.prompt();
				}).on('close', function() {
					console.log('closing')
				});
				self.rl.setPrompt(prefix, prefix.length);
				self.rl.prompt();
			});
		});
	},
	start: function(args){
		var self = this,
				client = this.add_client(args.uid,args.user,args.password,args.value);

		if (!client){
			this.error('Client already exists');
			return;
		}

		client.stream
			.addListener('tweet', function(tweet) {
				console.log("@" + tweet.user.screen_name + ": " + tweet.text);
			})
			.addListener('error', function(error){
				self.error(error.message);
			})
			.addListener('limit', function(limit) {
				console.log("LIMIT: " + util.inspect(limit));
			})
			.addListener('delete', function(del) {
				console.log("DELETE: " + util.inspect(del));
			})
			.addListener('end', function(resp) {
				if (resp.statusCode==401){
					self.error('Unauthorised');
				} else {
					self.error('Code '+resp.statusCode);
				}
				self.exit();
			})
			.addListener('ok', function(){
				console.log('access.granted');
				console.log('Tracking: '+args.value);
				client.stream.removeAllListeners('ok');
			})
			.stream();
	},
	exit: function(){
		this.rl.close();
		process.stdin.destroy();
		console.log('Good bye!');
		process.exit(0);
//		process.exit();
	},
	uid: function(data){
		if (data.user==false && data.password==false){
			return false;
		}
		var shasum = crypto.createHash('sha1');
		shasum.update(data.user+data.password);
		return	shasum.digest('hex');
	},
	help: function(){
		console.log('Type one of theese commands:')
		console.log('help: Show help')
		console.log('track: Sign in to twitter. Example: track twitter, san francisco, today');
		console.log('info: Show application state')
		console.log('exit: Quit application')
	}
});

module.exports = {
	tweetstreamer: Tweetstreamer,
	socket: SocketTweetstreamer,
	cli: CliTweetstreamer,
	read_config: function(file){
		var data = fs.readFileSync(file,'utf8');
		return	JSON.parse(data);
	}
};