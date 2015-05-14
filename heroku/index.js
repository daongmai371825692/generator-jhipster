'use strict';
var util = require('util'),
path = require('path'),
yeoman = require('yeoman-generator'),
exec = require('child_process').exec,
chalk = require('chalk'),
_s = require('underscore.string'),
scriptBase = require('../script-base');

var HerokuGenerator = module.exports = function HerokuGenerator(args, options, config) {
    yeoman.generators.Base.apply(this, arguments);
    console.log(chalk.bold('Heroku configuration is starting'));
    this.env.options.appPath = this.config.get('appPath') || 'src/main/webapp';
    this.baseName = this.config.get('baseName');
    this.packageName = this.config.get('packageName');
    this.packageFolder = this.config.get('packageFolder');
    this.javaVersion = this.config.get('javaVersion');
    this.hibernateCache = this.config.get('hibernateCache');
    this.databaseType = this.config.get('databaseType');
    this.prodDatabaseType = this.config.get('prodDatabaseType');
    this.angularAppName = _s.camelize(_s.slugify(this.baseName)) + 'App';
    this.buildTool = this.config.get('buildTool');
};

util.inherits(HerokuGenerator, yeoman.generators.Base);
util.inherits(HerokuGenerator, scriptBase);

HerokuGenerator.prototype.askFor = function askFor() {
    var done = this.async();

    var prompts = [
    {
        type: 'input',
        name: 'herokuDeployedName',
        message: 'Name to deploy as:',
        default: this.baseName
    },
    {
        type: "list",
        name: 'herokuRegion',
        message: 'On which region do you want to deploy ?',
        choices: [ "us", "eu"],
        default: 0
    },
    {
      type: "list",
      name: 'herokuType',
      message: 'Which method of deployment do you want ?',
      choices: [{
        value: 'CLI',
        name: 'CLI (recommended)'
      },
      {
        value: 'Git',
        name: 'Git'
      }],
      default: 0
    }];

    this.prompt(prompts, function (props) {
        this.herokuDeployedName = this._.slugify(props.herokuDeployedName);
        this.herokuRegion = props.herokuRegion;
        this.herokuType = props.herokuType;
        done();
    }.bind(this));
};

HerokuGenerator.prototype.checkInstallation = function checkInstallation() {
    if(this.abort) return;
    var done = this.async();

    exec('heroku --version', function (err) {
        if (err) {
            this.log.error('You don\'t have the Heroku Toolbelt installed. ' +
            'Download it from https://toolbelt.heroku.com/');
            this.abort = true;
        }
        done();
    }.bind(this));
};

HerokuGenerator.prototype.gitInit = function gitInit() {
    if(this.abort) return;
    if(this.herokuType != "Git") return;
    var done = this.async();

    try {
      var stats = fs.lstatSync('.git');
      this.log(chalk.bold('\nUsing existing Git repository'));
      done();
    } catch(e) {
      // An exception is thrown if the folder doesn't exist
      this.log(chalk.bold('\nInitializing Git repository'));
      var child = exec('git init', {}, function (err, stdout, stderr) {
        done();
      }.bind(this));
      child.stdout.on('data', function(data) {
        console.log(data.toString());
      });
    }
};

HerokuGenerator.prototype.herokuCreate = function herokuCreate() {
    if(this.abort) return;
    var done = this.async();

    if (this.prodDatabaseType != 'postgresql') {
      this.log.error('Only PostgreSQL is Supported for Heroku generator');
      this.abort = true;
      done();
      return;
    }

    var regionParams = (this.herokuRegion !== 'us') ? ' --region ' + this.herokuRegion : '';

    this.log(chalk.bold('Creating Heroku application and setting up node environment'));
    var herokuCreateCmd = 'heroku apps:create ' + this.herokuDeployedName + regionParams + ' --addons heroku-postgresql:hobby-dev';

    if (this.herokuType == 'Git') {
      herokuCreateCmd += ' && heroku buildpacks:add https://github.com/heroku/heroku-buildpack-nodejs --app ' + this.herokuDeployedName;

      if (this.buildTool == 'gradle') {
        herokuCreateCmd += ' && heroku buildpacks:add https://github.com/heroku/heroku-buildpack-gradle --app ' + this.herokuDeployedName;
        herokuCreateCmd += ' && heroku config:set --app ' + this.herokuDeployedName;
      } else {
        herokuCreateCmd += ' && heroku buildpacks:add https://github.com/heroku/heroku-buildpack-java --app ' + this.herokuDeployedName;
        herokuCreateCmd += ' && heroku config:set MAVEN_CUSTOM_OPTS="-Pprod,heroku -DskipTests=true" --app ' + this.herokuDeployedName;
      }
    } else {
      herokuCreateCmd += ' --no-remote';
    }

    console.log(herokuCreateCmd);
    var child = exec(herokuCreateCmd, {}, function (err, stdout, stderr) {
        if (err) {
            this.abort = true;
            this.log.error(err);
        }
        done();
    }.bind(this));

    child.stdout.on('data', function(data) {
        var output = data.toString();
        this.log(output);
    }.bind(this));

};

HerokuGenerator.prototype.copyHerokuFiles = function copyHerokuFiles() {
    if(this.abort) return;
    var done = this.async();
    this.log(chalk.bold('\nCreating Heroku deployment files'));

    this.template('src/main/java/package/config/_HerokuDatabaseConfiguration.java', 'src/main/java/' + this.packageFolder + '/config/HerokuDatabaseConfiguration.java');
    this.template('_Procfile', 'Procfile');

    if(this.herokuType == "Git") {
      this.npmInstall(['bower', 'grunt-cli'], { 'saveDev': true }, function (err, stdout, stderr) {
        if (err) {
          this.abort = true;
          this.log.error(err);
        }
        this.conflicter.resolve(function (err) {
          done();
        });
      }.bind(this));
    } else {
      this.conflicter.resolve(function (err) {
        done();
      });
    }
};

HerokuGenerator.prototype.productionBuild = function productionBuild() {
  if(this.abort) return;
  if(this.herokuType == "Git") return;

  if (this.buildTool == 'gradle') {
    this.abort = true;
    this.log.error("Gradle is not yet supported with Heroku CLI deployment");
    done()
    return;
  }

  var done = this.async();
  this.log(chalk.bold('\nBuilding application'));
  var child = exec('mvn package -Pprod -DskipTests=true', function (err, stdout) {
    if (err) {
      this.abort = true;
      this.log.error(err);
    }
    done();
  }.bind(this));

  child.stdout.on('data', function(data) {
    this.log(data.toString());
  }.bind(this));
};

HerokuGenerator.prototype.installHerokuDeployPlugin = function installHerokuDeployPlugin() {
  if(this.abort) return;
  if(this.herokuType != 'CLI') return;
  var done = this.async();
  this.log(chalk.bold('\nInstalling Heroku CLI deployment plugin'));
  var child = exec('heroku plugins:install https://github.com/heroku/heroku-deploy', function (err, stdout) {
    if (err) {
      this.abort = true;
      this.log.error(err);
    }
    done();
  }.bind(this));

  child.stdout.on('data', function(data) {
    this.log(data.toString());
  }.bind(this));
};

HerokuGenerator.prototype.herokuCliDeploy = function herokuCliDeploy() {
  if(this.abort) return;
  if(this.herokuType != 'CLI') return;
  var done = this.async();

  var herokuDeployCommand = 'heroku deploy:jar --jar target/*.war --app ' + this.herokuDeployedName
  this.log(chalk.bold("\nUploading your application code.\n This may take " + chalk.cyan('several minutes') + " depending on your connection speed..."));
  var child = exec(herokuDeployCommand, function (err, stdout) {
    if (err) {
      this.abort = true;
      this.log.error(err);
    }
    console.log(stdout);
    if (err) {
      console.log(chalk.red(err));
    } else {
      console.log(chalk.green('\nYour app should now be live. To view it run\n\t' + chalk.bold('heroku open --app ' + this.herokuDeployedName)));
      console.log(chalk.yellow('After application modification, repackage it with\n\t' + chalk.bold('mvn package -Pprod -DskipTests')));
      console.log(chalk.yellow('And then re-deploy it with\n\t' + chalk.bold(herokuDeployCommand)));
    }
    done();
    done();
  }.bind(this));

  child.stdout.on('data', function(data) {
    this.log(data.toString());
  }.bind(this));
};

HerokuGenerator.prototype.gitCommit = function gitCommit() {
    if(this.abort) return;
    if(this.herokuType != "Git") return;
    var done = this.async();

    this.log(chalk.bold('\nAdding files for deployment'));
    var child = exec('git add -A && git commit -m "Deploying to Heroku"', { maxBuffer: 500*1024 }, function (err, stdout, stderr) {
        if (stdout.search('nothing to commit') >= 0) {
            this.log('Re-pushing the existing build...');
        } else if (err) {
            this.log.error(err);
        } else {
            this.log(chalk.green('Done, without errors.'));
        }
        done();
    }.bind(this));

    child.stdout.on('data', function(data) {
        console.log(data.toString());
    });
};

HerokuGenerator.prototype.gitForcePush = function gitForcePush() {
    if(this.abort) return;
    if(this.herokuType != "Git") return;
    var done = this.async();

    this.log(chalk.bold("\nUploading your application code.\n This may take " + chalk.cyan('several minutes') + " depending on your connection speed..."));
        var insight = this.insight();
        insight.track('generator', 'heroku');

    var child = exec('git push -f heroku master', { maxBuffer: 500*1024 }, function (err, stdout, stderr) {
        console.log(stdout);
        if (err) {
            console.log(chalk.red(err));
        } else {
            console.log(chalk.green('\nYour app should now be live. To view it run\n\t' + chalk.bold('heroku open')));
            console.log(chalk.yellow('After application modification, re-deploy it with\n\t' + chalk.bold('git push heroku')));
        }
        done();
    }.bind(this));

    child.stdout.on('data', function(data) {
        console.log(data.toString());
    });
    child.stderr.on('data', function(data) {
        console.log(chalk.white(data.toString()));
    });
};
