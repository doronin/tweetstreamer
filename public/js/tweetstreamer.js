(function(){
	var App = {
				config: {
					env: 'development',	//	production
					socket: {
						protocol: 'http://',
						host: 'localhost',
						port: 3000,
						namespace: 'tweetstreamer'
					}
				},
				init: function(ready){
					var self = this;
					this.loading(true);
					$.getJSON('/config.'+this.config.env+'.json',function(config){
						self.config = $.extend(self.config,config);
						self.config.socket.url = self.config.socket.protocol+self.config.socket.host+':'+self.config.socket.port+'/'+config.socket.namespace;
						ready(config);
					})
				},
				/*
				 * Show loading window
				 * Hide loading window after autoclose ms
				 */
				loading: function(show,autoclose){
					var self = this;
					if (show){
						Popup.open($('#loading_template').html());
					} else {
						Popup.close();
					}
					if (autoclose){
						window.setTimeout(function(){
							self.loading(false);
						},autoclose);
					}
				}
			},
			Popup = {
				template: '#popup_template',
				open: function(content){
					var html = $(this.template).html().replace('{content}',content),
							$popup = $(html);
					$('body').append($popup);
					return $popup.find('.cell').children();
				},
				close: function(){
					if ($('.popup').length){
						$('.popup').remove();
					}
				}
			},
			LoginForm = {
				template: '#signin_template',
				el: {},
				options: {
					submit: new Function
				},
				open: function(options){
					var self = this;
					this.options = $.extend({},this.options,options);
					this.el = Popup.open($(this.template).html());
					this.form = $('form',this.el);
					this.form.submit(function(e){
						var user = $('input[name=user]',self.form).val(),
								password = $('input[name=password]',self.form).val();
						self.options.submit(user,password);
						e.preventDefault();
						return	false;
					});
				},
				close: function(){
					Popup.close();
				},
				error: function(error){
					$('.error', this.el).text(error).removeClass('hidden');
				}
			},
			/*
			 * Twitter Streamer
			 */
			Streamer = {
				template: '#streamer_template',
				el: {},
				options: {
					submit: new Function,
					stop: new Function
				},
				render: function(options){
					var self = this;
					this.options = $.extend({},this.options,options);

					this.el = $($(this.template).html());
					this.form = $('form', this.el);
					this.track = $('input[name=track]', this.form);
					this.tid = $('input[name=tid]', this.form);
					this.stop = $('button[name=stop]', this.form);

					this.queries = QueryList.render({
						streamer: this.el,
						action: function(tid,track){
							self.set_form(tid,track);
						}
					});
					this.streams = $('.streams', this.el);

					this.track.change(function(){
						self.tid.val('');
					});
					this.form.submit(function(e){
						self.options.submit(self.tid.val(), self.track.val());
						e.preventDefault();
						return	false;
					});
					this.stop.click(function(){
						self.options.stop();
					});
					return	this.el;
				},
				set_form: function(tid,track){
					this.track.val(track);
					this.tid.val(tid);
				}
			},
			/*
			 * List of processed queries
			 */
			QueryList = {
				el: {},
				className: 'queries',
				options: {
					streamer: {},
					action: new Function
				},
				render: function(options){
					this.options = $.extend({},this.options,options);
					this.el = $('.'+this.className, this.options.streamer);
					return this.el;
				},
				add: function(tid,track){
					var self = this,
							track_id = 'track_'+tid;
					if (!this.exists(tid)){
						var track_item = $('#track_template').html().replace('{content}',track),
								$track_item = $(track_item).data('tid',tid).attr('id','track_'+tid);
						$('span.track', $track_item).click(function(){
							self.options.action($(this).parent().data('tid'),$(this).text());
						});
						$('span.remove', $track_item).click(function(){
							$(this).parent().remove();
						});
						this.el.append($track_item);
					}
				},
				exists: function(tid){
					return $('#track_'+tid).length;
				}
			};


	$(document).ready(function(){
		App.init(function(config){
			var socket = io.connect(config.socket.url);
			socket.on('ready', function(data){
				App.loading(false);
				LoginForm.open({
					submit: function(user, password){
						socket.emit('signin', {user: user, password: password});
					}
				});
			});
			socket.on('access.denied',function(data){
				LoginForm.error(data.error);
			});
			socket.on('access.granted',function(){
				LoginForm.close();

				var streamer = Streamer.render({
					submit: function(tid,track){
						App.loading(true,15000);
						socket.emit('track',{tid: tid, track: track});
					},
					stop: function(){
						socket.emit('stop');
					}
				});
				$('#content').html(streamer);
			});
			socket.on('track',function(data){
				QueryList.add(data.tid, data.track);
			});
			socket.on('tweet',function(tweet){
				App.loading(false);
				Streamer.streams.prepend('<li>@'+tweet.user+': '+tweet.text+'</li>')
			});
		});
	});
})();