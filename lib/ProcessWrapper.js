var path = require("path"),
	LogRedirector = require("./LogRedirector"),
	usage = require("usage");

var ProcessWrapper = function() {
	process.title = process.env.BOSS_PROCESS_NAME;

	var redirector = new LogRedirector();
	redirector.once("ready", this._setUp.bind(this));
}

ProcessWrapper.prototype._setUp = function() {
	var script = process.env.BOSS_SCRIPT;

	this._setUpProcessCallbacks();
	this._switchToUserAndGroup();
	this._removeBossPropertiesFromEnvironment();

	process.nextTick(function() {
		// this will execute the passed script
		require(script);
		process.send({type: "process:ready"});
	});
}

ProcessWrapper.prototype._setUpProcessCallbacks = function() {
	// set up process actions
	process.on("uncaughtException", this._onUncaughtException.bind(this));
	process.on("message", function(event) {
		if(!event || !event.type) {
			return;
		}

		if(this[event.type]) {
			this[event.type](event);
		}
	}.bind(this));
}

// if we've been told to run as a different user or group (e.g. because they have fewer
// privileges), switch to that user before importing any third party application code.
ProcessWrapper.prototype._switchToUserAndGroup = function() {
	if(process.env.BOSS_RUN_AS_GROUP) {
		console.log("Setting process gid", process.env.BOSS_RUN_AS_GROUP);

		var gid = parseInt(process.env.BOSS_RUN_AS_GROUP, 10);
		process.setgid(isNaN(gid) ? process.env.BOSS_RUN_AS_GROUP : gid);
	}

	if(process.env.BOSS_RUN_AS_USER) {
		console.log("Setting process uid", process.env.BOSS_RUN_AS_USER);

		var uid = parseInt(process.env.BOSS_RUN_AS_USER, 10);
		var uidOrUsername = isNaN(uid) ? process.env.BOSS_RUN_AS_USER : uid;

		process.setgroups([]); // Remove old groups
		process.initgroups(uidOrUsername, process.getgid()); // Add user groups
		process.setuid(uidOrUsername); // Switch to requested user
	}
}

ProcessWrapper.prototype._removeBossPropertiesFromEnvironment = function() {
	// remove our properties
	for(var key in process.env) {
		if(key.substr(0, 4) == "BOSS") {
			delete process.env[key];
		}
	}
}

ProcessWrapper.prototype._onUncaughtException = function(error) {
	process.send({
		type : "process:uncaughtexception",
		error  : {
			type: error.type,
			stack: error.stack,
			arguments: error.arguments,
			message: error.message
		}
	});

	if(process.listeners("uncaughtException").length == 1) {
		process.nextTick(function() {
			process.exit(1);
		});
	}
}

ProcessWrapper.prototype["boss:status"] = function() {
	usage.lookup(process.pid, {
		keepHistory: true
	}, function(err, result) {
		process.send({
			type: "process:status",
			status: {
				pid: process.pid,
				uid: process.getuid(),
				gid: process.getgid(),
				title: process.title,
				uptime: process.uptime(),
				usage: {
					memory: process.memoryUsage(),
					cpu: result.cpu
				}
			}
		});
	});
}

module.exports = ProcessWrapper;