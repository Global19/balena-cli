_ = require('lodash-contrib')
path = require('path')
async = require('async')
resin = require('resin-sdk')
visuals = require('resin-cli-visuals')
vcs = require('resin-vcs')
tmp = require('tmp')

# Cleanup the temporary files even when an uncaught exception occurs
tmp.setGracefulCleanup()

commandOptions = require('./command-options')
osAction = require('./os')

exports.list =
	signature: 'devices'
	description: 'list all devices'
	help: '''
		Use this command to list all devices that belong to you.

		You can filter the devices by application by using the `--application` option.

		Examples:

			$ resin devices
			$ resin devices --application MyApp
			$ resin devices --app MyApp
			$ resin devices -a MyApp
	'''
	options: [ commandOptions.optionalApplication ]
	permission: 'user'
	action: (params, options, done) ->

		if options.application?
			getFunction = _.partial(resin.models.device.getAllByApplication, options.application)
		else
			getFunction = resin.models.device.getAll

		getFunction (error, devices) ->
			return done(error) if error?
			console.log visuals.widgets.table.horizontal devices, [
				'id'
				'name'
				'device_type'
				'is_online'
				'application_name'
				'status'
				'last_seen'
			]

			return done()

exports.info =
	signature: 'device <name>'
	description: 'list a single device'
	help: '''
		Use this command to show information about a single device.

		Examples:

			$ resin device MyDevice
	'''
	permission: 'user'
	action: (params, options, done) ->
		resin.models.device.get params.name, (error, device) ->
			return done(error) if error?
			console.log visuals.widgets.table.vertical device, [
				'id'
				'name'
				'device_type'
				'is_online'
				'ip_address'
				'application_name'
				'status'
				'last_seen'
				'uuid'
				'commit'
				'supervisor_version'
				'is_web_accessible'
				'note'
			]

			return done()

exports.remove =
	signature: 'device rm <name>'
	description: 'remove a device'
	help: '''
		Use this command to remove a device from resin.io.

		Notice this command asks for confirmation interactively.
		You can avoid this by passing the `--yes` boolean option.

		Examples:

			$ resin device rm MyDevice
			$ resin device rm MyDevice --yes
	'''
	options: [ commandOptions.yes ]
	permission: 'user'
	action: (params, options, done) ->
		visuals.patterns.remove 'device', options.yes, (callback) ->
			resin.models.device.remove(params.name, callback)
		, done

exports.identify =
	signature: 'device identify <uuid>'
	description: 'identify a device with a UUID'
	help: '''
		Use this command to identify a device.

		In the Raspberry Pi, the ACT led is blinked several times.

		Examples:

			$ resin device identify 23c73a12e3527df55c60b9ce647640c1b7da1b32d71e6a39849ac0f00db828
	'''
	permission: 'user'
	action: (params, options, done) ->
		resin.models.device.identify(params.uuid, done)

exports.rename =
	signature: 'device rename <name> [newName]'
	description: 'rename a resin device'
	help: '''
		Use this command to rename a device.

		If you omit the name, you'll get asked for it interactively.

		Examples:

			$ resin device rename MyDevice MyPi
			$ resin device rename MyDevice
	'''
	permission: 'user'
	action: (params, options, done) ->
		async.waterfall [

			(callback) ->
				if not _.isEmpty(params.newName)
					return callback(null, params.newName)
				visuals.widgets.ask('How do you want to name this device?', null, callback)

			(newName, callback) ->
				resin.models.device.rename(params.name, newName, callback)

		], done

exports.supported =
	signature: 'devices supported'
	description: 'list all supported devices'
	help: '''
		Use this command to get the list of all supported devices

		Examples:

			$ resin devices supported
	'''
	permission: 'user'
	action: (params, options, done) ->
		resin.models.device.getSupportedDeviceTypes (error, devices) ->
			return done(error) if error?
			_.each(devices, _.unary(console.log))
			done()

exports.await =
	signature: 'device await <name>'
	description: 'await for a device to become online'
	help: '''
		Use this command to await for a device to become online.

		The process will exit when the device becomes online.

		Notice that there is no time limit for this command, so it might run forever.

		You can configure the poll interval with the --interval option (defaults to 3000ms).

		Examples:

			$ resin device await MyDevice
			$ resin device await MyDevice --interval 1000
	'''
	options: [
		signature: 'interval'
		parameter: 'interval'
		description: 'poll interval'
		alias: 'i'
	]
	permission: 'user'
	action: (params, options, done) ->
		options.interval ?= 3000

		poll = ->
			resin.models.device.isOnline params.name, (error, isOnline) ->
				return done(error) if error?

				if isOnline
					console.info("Device became online: #{params.name}")
					return done()
				else
					console.info("Polling device network status: #{params.name}")
					setTimeout(poll, options.interval)

		poll()

exports.init =
	signature: 'device init [device]'
	description: 'initialise a device with resin os'
	help: '''
		Use this command to download the OS image of a certain application and write it to an SD Card.

		Note that this command requires admin privileges.

		If `device` is omitted, you will be prompted to select a device interactively.

		Notice this command asks for confirmation interactively.
		You can avoid this by passing the `--yes` boolean option.

		You can quiet the progress bar by passing the `--quiet` boolean option.

		You may have to unmount the device before attempting this operation.

		You need to configure the network type and other settings:

		Ethernet:
		  You can setup the device OS to use ethernet by setting the `--network` option to "ethernet".

		Wifi:
		  You can setup the device OS to use wifi by setting the `--network` option to "wifi".
		  If you set "network" to "wifi", you will need to specify the `--ssid` and `--key` option as well.

		You can omit network related options to be asked about them interactively.

		Examples:

			$ resin device init
			$ resin device init --application MyApp
			$ resin device init --application MyApp --network ethernet
			$ resin device init /dev/disk2 --application MyApp --network wifi --ssid MyNetwork --key secret
	'''
	options: [
		commandOptions.optionalApplication
		commandOptions.network
		commandOptions.wifiSsid
		commandOptions.wifiKey
	]
	permission: 'user'
	action: (params, options, done) ->

		async.waterfall([

			(callback) ->
				return callback(null, options.application) if options.application?
				vcs.getApplicationName(process.cwd(), callback)

			(applicationName, callback) ->
				params.name = applicationName
				return callback(null, params.device) if params.device?
				visuals.patterns.selectDrive(callback)

			(device, callback) ->
				params.device = device
				message = "This will completely erase #{params.device}. Are you sure you want to continue?"
				visuals.patterns.confirm(options.yes, message, callback)

			(confirmed, callback) ->
				return done() if not confirmed
				options.yes = confirmed

				tmp.file
					prefix: 'resin-image-'
					postfix: '.img'
				, callback

			(tmpPath, tmpFd, cleanupCallback, callback) ->
				options.output = tmpPath
				osAction.download.action params, options, (error, outputFile) ->
					return callback(error) if error?
					return callback(null, outputFile, cleanupCallback)

			(outputFile, cleanupCallback, callback) ->
				params.image = outputFile
				osAction.install.action params, options, (error) ->
					return callback(error) if error?
					cleanupCallback()
					return callback()

		], done)
