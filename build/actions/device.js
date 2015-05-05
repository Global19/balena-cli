(function() {
  var _, async, commandOptions, osAction, path, resin, tmp, vcs, visuals;

  _ = require('lodash-contrib');

  path = require('path');

  async = require('async');

  resin = require('resin-sdk');

  visuals = require('resin-cli-visuals');

  vcs = require('resin-vcs');

  tmp = require('tmp');

  tmp.setGracefulCleanup();

  commandOptions = require('./command-options');

  osAction = require('./os');

  exports.list = {
    signature: 'devices',
    description: 'list all devices',
    help: 'Use this command to list all devices that belong to you.\n\nYou can filter the devices by application by using the `--application` option.\n\nExamples:\n\n	$ resin devices\n	$ resin devices --application MyApp\n	$ resin devices --app MyApp\n	$ resin devices -a MyApp',
    options: [commandOptions.optionalApplication],
    permission: 'user',
    action: function(params, options, done) {
      var getFunction;
      if (options.application != null) {
        getFunction = _.partial(resin.models.device.getAllByApplication, options.application);
      } else {
        getFunction = resin.models.device.getAll;
      }
      return getFunction(function(error, devices) {
        if (error != null) {
          return done(error);
        }
        console.log(visuals.widgets.table.horizontal(devices, ['id', 'name', 'device_type', 'is_online', 'application_name', 'status', 'last_seen']));
        return done();
      });
    }
  };

  exports.info = {
    signature: 'device <name>',
    description: 'list a single device',
    help: 'Use this command to show information about a single device.\n\nExamples:\n\n	$ resin device MyDevice',
    permission: 'user',
    action: function(params, options, done) {
      return resin.models.device.get(params.name, function(error, device) {
        if (error != null) {
          return done(error);
        }
        console.log(visuals.widgets.table.vertical(device, ['id', 'name', 'device_type', 'is_online', 'ip_address', 'application_name', 'status', 'last_seen', 'uuid', 'commit', 'supervisor_version', 'is_web_accessible', 'note']));
        return done();
      });
    }
  };

  exports.remove = {
    signature: 'device rm <name>',
    description: 'remove a device',
    help: 'Use this command to remove a device from resin.io.\n\nNotice this command asks for confirmation interactively.\nYou can avoid this by passing the `--yes` boolean option.\n\nExamples:\n\n	$ resin device rm MyDevice\n	$ resin device rm MyDevice --yes',
    options: [commandOptions.yes],
    permission: 'user',
    action: function(params, options, done) {
      return visuals.patterns.remove('device', options.yes, function(callback) {
        return resin.models.device.remove(params.name, callback);
      }, done);
    }
  };

  exports.identify = {
    signature: 'device identify <uuid>',
    description: 'identify a device with a UUID',
    help: 'Use this command to identify a device.\n\nIn the Raspberry Pi, the ACT led is blinked several times.\n\nExamples:\n\n	$ resin device identify 23c73a12e3527df55c60b9ce647640c1b7da1b32d71e6a39849ac0f00db828',
    permission: 'user',
    action: function(params, options, done) {
      return resin.models.device.identify(params.uuid, done);
    }
  };

  exports.rename = {
    signature: 'device rename <name> [newName]',
    description: 'rename a resin device',
    help: 'Use this command to rename a device.\n\nIf you omit the name, you\'ll get asked for it interactively.\n\nExamples:\n\n	$ resin device rename MyDevice MyPi\n	$ resin device rename MyDevice',
    permission: 'user',
    action: function(params, options, done) {
      return async.waterfall([
        function(callback) {
          if (!_.isEmpty(params.newName)) {
            return callback(null, params.newName);
          }
          return visuals.widgets.ask('How do you want to name this device?', null, callback);
        }, function(newName, callback) {
          return resin.models.device.rename(params.name, newName, callback);
        }
      ], done);
    }
  };

  exports.supported = {
    signature: 'devices supported',
    description: 'list all supported devices',
    help: 'Use this command to get the list of all supported devices\n\nExamples:\n\n	$ resin devices supported',
    permission: 'user',
    action: function(params, options, done) {
      return resin.models.device.getSupportedDeviceTypes(function(error, devices) {
        if (error != null) {
          return done(error);
        }
        _.each(devices, _.unary(console.log));
        return done();
      });
    }
  };

  exports.await = {
    signature: 'device await <name>',
    description: 'await for a device to become online',
    help: 'Use this command to await for a device to become online.\n\nThe process will exit when the device becomes online.\n\nNotice that there is no time limit for this command, so it might run forever.\n\nYou can configure the poll interval with the --interval option (defaults to 3000ms).\n\nExamples:\n\n	$ resin device await MyDevice\n	$ resin device await MyDevice --interval 1000',
    options: [
      {
        signature: 'interval',
        parameter: 'interval',
        description: 'poll interval',
        alias: 'i'
      }
    ],
    permission: 'user',
    action: function(params, options, done) {
      var poll;
      if (options.interval == null) {
        options.interval = 3000;
      }
      poll = function() {
        return resin.models.device.isOnline(params.name, function(error, isOnline) {
          if (error != null) {
            return done(error);
          }
          if (isOnline) {
            console.info("Device became online: " + params.name);
            return done();
          } else {
            console.info("Polling device network status: " + params.name);
            return setTimeout(poll, options.interval);
          }
        });
      };
      return poll();
    }
  };

  exports.init = {
    signature: 'device init [device]',
    description: 'initialise a device with resin os',
    help: 'Use this command to download the OS image of a certain application and write it to an SD Card.\n\nNote that this command requires admin privileges.\n\nIf `device` is omitted, you will be prompted to select a device interactively.\n\nNotice this command asks for confirmation interactively.\nYou can avoid this by passing the `--yes` boolean option.\n\nYou can quiet the progress bar by passing the `--quiet` boolean option.\n\nYou may have to unmount the device before attempting this operation.\n\nYou need to configure the network type and other settings:\n\nEthernet:\n  You can setup the device OS to use ethernet by setting the `--network` option to "ethernet".\n\nWifi:\n  You can setup the device OS to use wifi by setting the `--network` option to "wifi".\n  If you set "network" to "wifi", you will need to specify the `--ssid` and `--key` option as well.\n\nYou can omit network related options to be asked about them interactively.\n\nExamples:\n\n	$ resin device init\n	$ resin device init --application MyApp\n	$ resin device init --application MyApp --network ethernet\n	$ resin device init /dev/disk2 --application MyApp --network wifi --ssid MyNetwork --key secret',
    options: [commandOptions.optionalApplication, commandOptions.network, commandOptions.wifiSsid, commandOptions.wifiKey],
    permission: 'user',
    action: function(params, options, done) {
      return async.waterfall([
        function(callback) {
          if (options.application != null) {
            return callback(null, options.application);
          }
          return vcs.getApplicationName(process.cwd(), callback);
        }, function(applicationName, callback) {
          params.name = applicationName;
          if (params.device != null) {
            return callback(null, params.device);
          }
          return visuals.patterns.selectDrive(callback);
        }, function(device, callback) {
          var message;
          params.device = device;
          message = "This will completely erase " + params.device + ". Are you sure you want to continue?";
          return visuals.patterns.confirm(options.yes, message, callback);
        }, function(confirmed, callback) {
          if (!confirmed) {
            return done();
          }
          options.yes = confirmed;
          return tmp.file({
            prefix: 'resin-image-',
            postfix: '.img'
          }, callback);
        }, function(tmpPath, tmpFd, cleanupCallback, callback) {
          options.output = tmpPath;
          return osAction.download.action(params, options, function(error, outputFile) {
            if (error != null) {
              return callback(error);
            }
            return callback(null, outputFile, cleanupCallback);
          });
        }, function(outputFile, cleanupCallback, callback) {
          params.image = outputFile;
          return osAction.install.action(params, options, function(error) {
            if (error != null) {
              return callback(error);
            }
            cleanupCallback();
            return callback();
          });
        }
      ], done);
    }
  };

}).call(this);
