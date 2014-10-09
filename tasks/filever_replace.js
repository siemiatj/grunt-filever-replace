'use strict';
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var chalk = require('chalk');
var eachAsync = require('each-async');

module.exports = function (grunt) {

  function reEscape(s) { // http://stackoverflow.com/a/18620139/899047
    return s.replace(/[$-\/?[-^{|}]/g, '\\$&');
  }

  function endsWith(s, suffix) { // http://stackoverflow.com/a/2548133/899047
    return s.indexOf(suffix, s.length - suffix.length) !== -1;
  }

  function replaceFirstGroup(s, pattern, replacement) {
    var match = pattern.exec(s);
    if (match) {
      return s.replace(pattern, match[0].replace(match[1] || match[0], replacement));
    } else {
      return s;
    }
  }

  grunt.registerMultiTask('filever_replace', 'File revisioning based on content hashing', function () {
    var options = this.options({
      encoding: 'utf8',
      algorithm: 'md5',
      length: 8
    });
    var hash = crypto.createHash(options.algorithm).digest('hex');
    var suffix = hash.slice(0, options.length);
    var target = this.target;
    var filever_replace = grunt.filever_replace || {summary: {}};
    var that = this;


    if (target === 'version') {
      eachAsync(this.files, function (el, i, next) {
        var move = true;
        
        // If dest is furnished it should indicate a directory
        if (el.dest) {
          // When globbing is used, el.dest contains basename, we remove it
          if(el.orig.expand) {
            el.dest = path.dirname(el.dest);
          }

          try {
            var stat = fs.lstatSync(el.dest);
            if (stat && !stat.isDirectory()) {
              grunt.fail.fatal('Destination for target %s is not a directory', target);
            }
          } catch (err) {
            grunt.log.writeln('Destination dir ' + el.dest + ' does not exists for target ' + target + ': creating');
            grunt.file.mkdir(el.dest);
          }
          // We need to copy file as we now have a dest different from the src
          move = false;
        }

        el.src.forEach(function (file) {
          var dirname;
          var ext = path.extname(file);
          var newName = [path.basename(file, ext), suffix, ext.slice(1)].join('.');
          var resultPath;

          if (move) {
            dirname = path.dirname(file);
            resultPath = path.resolve(dirname, newName);
            fs.renameSync(file, resultPath);
          } else {
            dirname = el.dest;
            resultPath = path.resolve(dirname, newName);
            grunt.file.copy(file, resultPath);
          }

          filever_replace.summary[path.normalize(file)] = path.join(dirname, newName);
          grunt.log.writeln(chalk.green('✔ ') + file + chalk.gray(' changed to ') + newName);
        });
        next();

      }, this.async());
    
    }

    if (target === 'replace') {


      // var path = require('path');
      var sep = '/';
      var options = this.options();
      var versioned = filever_replace.summary;

      if (versioned && path.sep !== sep) {
        var re = new RegExp(reEscape(path.sep), 'g');
        for (var assetpath in versioned) {
          versioned[assetpath.replace(re, sep)] = versioned[assetpath].replace(re, sep);
          delete versioned[assetpath];
        }
      }

      grunt.log.debug(this.nameArgs + ': ' + JSON.stringify(this.files, null, 4) +
        JSON.stringify(options, null, 4));
      grunt.log.debug('filerev.summary: ' + JSON.stringify(versioned, null, 4));

      if (versioned) {
        this.files.forEach(function(file) {
          file.src.filter(function(filepath) {
            if (!grunt.file.exists(filepath)) {
              grunt.log.warn('Source file "' + filepath + '" not found.');
              return false;
            } else {
              return true;
            }
          }).forEach(function(filepath) {
            var content = grunt.file.read(filepath);
            var updated = false;
            var replacement, lastLink, baseLink, hashLink;

            for (var label in options.patterns) {
              var pattern = options.patterns[label];
              var match = pattern.exec(content);
              if (match) {
                grunt.log.debug('Matching ' + [filepath, pattern, JSON.stringify(match)].join(': '));
                replacement = match[0];
                lastLink = match[1] || match[0];
                baseLink = options.hash ? replaceFirstGroup(lastLink, options.hash, '') : lastLink;
                for (var assetpath in versioned) {
                  if (endsWith(assetpath, baseLink)) {
                    if (!updated) {
                      grunt.log.writeln('Updating ' + filepath.cyan +
                        (file.dest ? ' -> ' + file.dest.cyan : '.'));
                    }
                    hashLink = versioned[assetpath].slice(assetpath.length - baseLink.length);
                    if (lastLink !== hashLink) {
                      grunt.log.writeln('Linking ' + label + ': ' + lastLink +
                        (baseLink !== lastLink ? ' -> ' + baseLink : '') + ' -> ' + hashLink.green);
                      replacement = replacement.replace(lastLink, hashLink);
                      content = content.replace(pattern, replacement);
                      updated = true;
                    } else {
                      grunt.log.writeln('Already linked ' + label + ': ' +
                        baseLink + ' -> ' + hashLink.green);
                    }
                    break;
                  } else {
                    grunt.log.debug('No match: ' + lastLink +
                      (baseLink !== lastLink ? ' -> ' + baseLink : '') + ' <> ' + assetpath);
                  }
                }
              } else {
                grunt.log.debug('Not matching ' + filepath + ': ' + pattern);
              }
            }
            if (updated) {
              grunt.file.write(file.dest || filepath, content);
            }
          });
        });
      }


    }

    grunt.filever_replace = filever_replace;
  });
};
